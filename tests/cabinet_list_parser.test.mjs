import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseAccessRightsCabinetText,
  parseCabinetListText,
} from "../src/cabinet_list_parser.mjs";

test("parses VK Ads cabinet dropdown text into name and id rows", () => {
  const text = [
    "Поиск",
    "Очистить",
    "9:41 | Краснодар (2)",
    "Готово!",
    "Скопировать ID",
    "ID: 30933439",
    "iPrice | Орёл",
    "Готово!",
    "Скопировать ID",
    "ID: 30953711",
    "Gorilla Street | Набережные Челны",
    "Готово!",
    "Скопировать ID",
    "ID: 1090425356",
  ].join("\n");

  assert.deepEqual(parseCabinetListText(text), [
    { cabinetName: "9:41 | Краснодар (2)", cabinetId: "30933439" },
    { cabinetName: "iPrice | Орёл", cabinetId: "30953711" },
    { cabinetName: "Gorilla Street | Набережные Челны", cabinetId: "1090425356" },
  ]);
});

test("parses access rights table text into cabinet name and id rows", () => {
  const text = [
    "Название кабинета",
    "ID кабинета VK Рекламы",
    "City Gadget | Челябинск",
    "30656256",
    "Полный доступ",
    "Gorilla Street | Набережные Челны",
    "1090548781",
    "Полный доступ",
    "Даниил Гилемзянов",
    "30710361",
  ].join("\n");

  assert.deepEqual(parseAccessRightsCabinetText(text), [
    { cabinetName: "City Gadget | Челябинск", cabinetId: "30656256" },
    { cabinetName: "Gorilla Street | Набережные Челны", cabinetId: "1090548781" },
  ]);
});
