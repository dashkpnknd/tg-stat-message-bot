import json
import os

from config import ACCOUNT_PHONE_NUMBERS, STATS_FILE_PATH


def default_stats():
    return {
        "channel_posts": 0,
        "total_sent_messages": 0,
        "total_replied_messages": 0,
        "unique_recipients_today": [],
        "unique_repliers_today": [],
        "account_specific_stats": {
            phone: {"sent": 0, "replies": 0}
            for phone in ACCOUNT_PHONE_NUMBERS
        }
    }


def load_stats():
    if not os.path.exists(STATS_FILE_PATH):
        return default_stats()

    try:
        with open(STATS_FILE_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)

        stats = default_stats()
        stats["channel_posts"] = data.get("channel_posts", 0)
        stats["total_sent_messages"] = data.get("total_sent_messages", 0)
        stats["total_replied_messages"] = data.get("total_replied_messages", 0)
        stats["unique_recipients_today"] = data.get("unique_recipients_today", [])
        stats["unique_repliers_today"] = data.get("unique_repliers_today", [])

        saved_account_stats = data.get("account_specific_stats", {})
        for phone in stats["account_specific_stats"]:
            if phone in saved_account_stats:
                stats["account_specific_stats"][phone]["sent"] = saved_account_stats[phone].get("sent", 0)
                stats["account_specific_stats"][phone]["replies"] = saved_account_stats[phone].get("replies", 0)

        return stats
    except Exception:
        return default_stats()


def save_stats(stats):
    try:
        data = {
            "channel_posts": stats["channel_posts"],
            "total_sent_messages": stats["total_sent_messages"],
            "total_replied_messages": stats["total_replied_messages"],
            "unique_recipients_today": list(stats["unique_recipients_today"]),
            "unique_repliers_today": list(stats["unique_repliers_today"]),
            "account_specific_stats": stats["account_specific_stats"],
        }

        with open(STATS_FILE_PATH, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
    except Exception:
        pass