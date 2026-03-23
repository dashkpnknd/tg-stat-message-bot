import asyncio
import logging
import os
from datetime import datetime

import gspread
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from telethon import TelegramClient, events

from config import (
    ACCOUNT_PHONE_NUMBERS,
    CHANNEL_TO_MONITOR_ID,
    DATE_COLUMN,
    GLOBAL_API_CONFIG,
    GOOGLE_SHEETS_CREDENTIALS_FILE,
    LOG_FORMAT,
    LOG_LEVEL,
    REPORT_HOUR,
    REPORT_MINUTE,
    REPORT_SECOND,
    SCHEDULER_TIMEZONE,
    SESSIONS_DIR,
    SPREADSHEET_NAME,
    STATS_FILE_PATH,
    TOTAL_REPLIED_COLUMN,
    TOTAL_SENT_COLUMN,
    CHANNEL_POSTS_COLUMN,
    WORKSHEET_NAME,
)
from stats_storage import load_stats, save_stats


logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format=LOG_FORMAT
)


loaded_stats = load_stats()

global_stats = {
    "channel_posts": loaded_stats["channel_posts"],
    "total_sent_messages": loaded_stats["total_sent_messages"],
    "total_replied_messages": loaded_stats["total_replied_messages"],
    "unique_recipients_today": set(loaded_stats["unique_recipients_today"]),
    "unique_repliers_today": set(loaded_stats["unique_repliers_today"]),
    "account_specific_stats": loaded_stats["account_specific_stats"],
}


async def update_google_sheet_all_stats(date_str, channel_posts, total_sent, total_replied):
    def write_to_sheet():
        gc = gspread.service_account(filename=GOOGLE_SHEETS_CREDENTIALS_FILE)
        sheet = gc.open(SPREADSHEET_NAME).worksheet(WORKSHEET_NAME)

        dates_column = sheet.col_values(DATE_COLUMN)

        row_index = -1
        for i, value in enumerate(dates_column):
            if value == date_str:
                row_index = i + 1
                break

        if row_index == -1:
            row_index = len(dates_column) + 1
            sheet.update_cell(row_index, DATE_COLUMN, date_str)
            logging.info(f"Created new row for date {date_str}")

        sheet.update_cell(row_index, TOTAL_SENT_COLUMN, total_sent)
        sheet.update_cell(row_index, TOTAL_REPLIED_COLUMN, total_replied)
        sheet.update_cell(row_index, CHANNEL_POSTS_COLUMN, channel_posts)

        logging.info(f"Statistics for {date_str} were written to row {row_index}")

    try:
        await asyncio.to_thread(write_to_sheet)
    except Exception as e:
        logging.error(f"Google Sheets write error: {e}")


async def reset_and_log_daily_stats():
    today = datetime.now()
    date_str = today.strftime("%d.%m.%Y")

    logging.info(f"Starting daily report write for {date_str}")

    await update_google_sheet_all_stats(
        date_str,
        global_stats["channel_posts"],
        global_stats["total_sent_messages"],
        global_stats["total_replied_messages"]
    )

    global_stats["channel_posts"] = 0
    global_stats["total_sent_messages"] = 0
    global_stats["total_replied_messages"] = 0
    global_stats["unique_recipients_today"].clear()
    global_stats["unique_repliers_today"].clear()

    for phone in global_stats["account_specific_stats"]:
        global_stats["account_specific_stats"][phone]["sent"] = 0
        global_stats["account_specific_stats"][phone]["replies"] = 0

    save_stats(global_stats)

    logging.info("Daily counters have been reset")


def setup_client_handlers(client: TelegramClient, phone: str, is_channel_monitor=False):
    @client.on(events.NewMessage(outgoing=True))
    async def handle_outgoing(event):
        peer_id = event.chat_id
        if not peer_id:
            return

        if peer_id not in global_stats["unique_recipients_today"]:
            global_stats["unique_recipients_today"].add(peer_id)
            global_stats["total_sent_messages"] += 1
            global_stats["account_specific_stats"][phone]["sent"] += 1
            save_stats(global_stats)
            logging.info(f"[{phone}] Outgoing message to {peer_id}")

    @client.on(events.NewMessage(incoming=True))
    async def handle_incoming(event):
        sender_id = event.sender_id
        if not sender_id:
            return

        me = await client.get_me()
        if sender_id == me.id:
            return

        if sender_id not in global_stats["unique_recipients_today"]:
            return

        if sender_id not in global_stats["unique_repliers_today"]:
            global_stats["unique_repliers_today"].add(sender_id)
            global_stats["total_replied_messages"] += 1
            global_stats["account_specific_stats"][phone]["replies"] += 1
            save_stats(global_stats)
            logging.info(f"[{phone}] First reply from {sender_id}")

    if is_channel_monitor:
        @client.on(events.NewMessage(chats=[CHANNEL_TO_MONITOR_ID]))
        async def handle_channel(event):
            global_stats["channel_posts"] += 1
            save_stats(global_stats)
            logging.info(
                f"Channel post recorded. Total today: {global_stats['channel_posts']}"
            )


async def main():
    if not os.path.exists(SESSIONS_DIR):
        os.makedirs(SESSIONS_DIR)

    clients = []

    for i, phone in enumerate(ACCOUNT_PHONE_NUMBERS):
        client = TelegramClient(
            f"{SESSIONS_DIR}/{phone}",
            GLOBAL_API_CONFIG["api_id"],
            GLOBAL_API_CONFIG["api_hash"]
        )

        setup_client_handlers(client, phone, is_channel_monitor=(i == 0))

        try:
            await client.start(phone=phone)
            clients.append(client)
            logging.info(f"Account {phone} started")
        except Exception as e:
            logging.error(f"Startup error for {phone}: {e}")

    scheduler = AsyncIOScheduler(timezone=SCHEDULER_TIMEZONE)
    scheduler.add_job(
        reset_and_log_daily_stats,
        "cron",
        hour=REPORT_HOUR,
        minute=REPORT_MINUTE,
        second=REPORT_SECOND
    )
    scheduler.start()

    logging.info(
        f"Scheduler started. Report time: "
        f"{REPORT_HOUR:02d}:{REPORT_MINUTE:02d}:{REPORT_SECOND:02d}"
    )

    await asyncio.gather(*(client.run_until_disconnected() for client in clients))


if __name__ == "__main__":
    asyncio.run(main())