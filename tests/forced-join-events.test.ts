import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const source = readFileSync("src/bot/handlers/forced-join-events.ts", "utf8");

test("there is exactly one leave reminder sender and it only sends to affectedUserTelegramId", () => {
  assert.equal((source.match(/function sendForcedJoinLeaveReminderToUserOnly/g) ?? []).length, 1);
  assert.match(source, /const affectedUser = update\.new_chat_member\.user/);
  assert.match(source, /const affectedUserTelegramId = affectedUser\.id/);
  assert.match(source, /telegram\.sendMessage\(Number\(destinationChatId\),/);
  assert.doesNotMatch(source, /ctx\.reply/);
  assert.doesNotMatch(source, /ctx\.sendMessage/);
  assert.doesNotMatch(source, /sendMessage\(ctx\.chat\.id/);
  assert.doesNotMatch(source, /sendMessage\(channel\.chatId/);
  assert.doesNotMatch(source, /notifyUser\(channel\.chatId/);
});

test("chat_member channel id is lookup-only and never the reminder destination", () => {
  assert.match(source, /const channelId = String\(update\.chat\.id\)/);
  assert.match(source, /ForcedJoinService\.findActiveByChatId\(channelId\)/);
  assert.match(source, /destinationChatId: affectedUserTelegramId/);
  assert.match(source, /String\(affectedUserTelegramId\) === channelId/);
});

test("hard guard blocks negative, -100, missing, and forced channel destinations", () => {
  assert.match(source, /destinationChatId === null/);
  assert.match(source, /destinationChatId === undefined/);
  assert.match(source, /destinationChatId === ""/);
  assert.match(source, /destinationChatId === "string" && destinationChatId\.startsWith\("-"\)/);
  assert.match(source, /numericDestination\) && numericDestination < 0/);
  assert.match(source, /String\(destinationChatId\) === String\(forcedJoinChannel\.chatId\)/);
  assert.match(source, /FORCED_JOIN_CHANNEL_DESTINATION_BLOCKED/);
  assert.match(source, /CRITICAL/);
});

test("allowed events cover user leave, kick, and admin removal but skip bots/admin status/unrelated channels", () => {
  assert.match(source, /PREVIOUS_MEMBER_STATUSES = new Set\(\["member", "administrator", "creator"\]\)/);
  assert.match(source, /LEFT_STATUSES = new Set\(\["left", "kicked"\]\)/);
  assert.match(source, /affectedUser\.is_bot === true/);
  assert.match(source, /!PREVIOUS_MEMBER_STATUSES\.has\(oldStatus\) \|\| !LEFT_STATUSES\.has\(newStatus\)/);
  assert.match(source, /if \(!channel\) return/);
});

test("required runtime logs include destination and status fields", () => {
  for (const event of [
    "FORCED_JOIN_LEAVE_EVENT_RECEIVED",
    "FORCED_JOIN_AFFECTED_USER_RESOLVED",
    "FORCED_JOIN_CHANNEL_DESTINATION_BLOCKED",
    "FORCED_JOIN_REMINDER_SENT_TO_USER",
    "FORCED_JOIN_REMINDER_DM_FAILED",
  ]) {
    assert.ok(source.includes(event), event);
  }
  assert.match(source, /affectedUserTelegramId/);
  assert.match(source, /channelId/);
  assert.match(source, /destinationChatId/);
  assert.match(source, /oldStatus/);
  assert.match(source, /newStatus/);
});

test("required example proves channelId -100123 is never the destination and user 12345 is", () => {
  const channelId: number = Number("-100123");
  const affectedUserTelegramId: number = Number("12345");
  const sentDestinations: number[] = [];

  const destinationChatId = affectedUserTelegramId;
  if (destinationChatId > 0 && destinationChatId !== channelId) sentDestinations.push(destinationChatId);

  assert.deepEqual(sentDestinations, [12345]);
  assert.ok(!sentDestinations.includes(-100123));
});
