import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/bot/handlers/forced-join-events.ts", "utf8");

test("user leaves a forced-join channel: reminder destination is affected user private chat", () => {
  assert.match(source, /const affectedUser = update\.new_chat_member\.user/);
  assert.match(source, /affectedUserId: affectedUser\.id/);
  assert.match(source, /telegram\.sendMessage\(affectedUserId,/);
  assert.doesNotMatch(source, /ctx\.reply/);
  assert.doesNotMatch(source, /ctx\.sendMessage/);
  assert.doesNotMatch(source, /sendMessage\(ctx\.chat/);
  assert.doesNotMatch(source, /ctx\.telegram\.sendMessage\(ctx\.chat\.id/);
});

test("chat_member update uses channel id only for forced-join lookup and ignores unrelated events", () => {
  assert.match(source, /const channelChatId = String\(update\.chat\.id\)/);
  assert.match(source, /ForcedJoinService\.findActiveByChatId\(channelChatId\)/);
  assert.match(source, /if \(!channel\) return/);
  assert.match(source, /if \(affectedUser\.is_bot\) return/);
  assert.match(source, /PREVIOUS_MEMBER_STATUSES\.has\(oldStatus\).*LEFT_STATUSES\.has\(newStatus\)/s);
});

test("admin removal still sends to affected user, not admin actor", () => {
  assert.match(source, /const affectedUser = update\.new_chat_member\.user/);
  assert.match(source, /affectedUserId: affectedUser\.id/);
  assert.doesNotMatch(source, /from\.id/);
});

test("DM failure is caught without any fallback channel send", () => {
  assert.match(source, /catch \(error\)/);
  assert.match(source, /FORCED_JOIN_REMINDER_SKIPPED_DM_FAILED/);
  assert.doesNotMatch(source, /catch \(error\)[\s\S]*sendMessage\(channel/);
  assert.doesNotMatch(source, /catch \(error\)[\s\S]*sendMessage\(channelChatId/);
  assert.doesNotMatch(source, /catch \(error\)[\s\S]*sendMessage\(update\.chat\.id/);
});

test("helper rejects missing or channel-like affected user destinations", () => {
  assert.match(source, /function isChannelLikeTelegramId/);
  assert.match(source, /!affectedUserId/);
  assert.match(source, /String\(affectedUserId\) === String\(channel\.chatId\)/);
  assert.match(source, /isChannelLikeTelegramId\(affectedUserId\)/);
  assert.match(source, /FORCED_JOIN_REMINDER_BLOCKED_CHANNEL_DESTINATION/);
});

for (const event of [
  "FORCED_JOIN_LEAVE_DETECTED",
  "FORCED_JOIN_REMINDER_SENT_DM",
  "FORCED_JOIN_REMINDER_DM_FAILED",
  "FORCED_JOIN_REMINDER_SKIPPED_DM_FAILED",
  "FORCED_JOIN_REMINDER_BLOCKED_CHANNEL_DESTINATION",
]) {
  test(`${event} structured log is present`, () => {
    assert.ok(source.includes(event));
    assert.match(source, /affectedUserTelegramId/);
    assert.match(source, /channelId/);
    assert.match(source, /channelTitle/);
    assert.match(source, /oldStatus/);
    assert.match(source, /newStatus/);
  });
}
