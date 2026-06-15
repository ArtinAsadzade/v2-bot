const fs = require('fs');
const path = require('path');

const root = process.cwd();
const src = path.join(root, 'src');
const files = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(ent.name)) files.push(p);
  }
}
walk(src);
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(root, p);
let failures = [];
function ok(cond, msg) { if (!cond) failures.push(msg); }

const panelUi = read(path.join(src, 'bot/navigation/panel-ui.ts'));
const typeBlock = panelUi.slice(panelUi.indexOf("export type PanelViewId"), panelUi.indexOf("export type ViewState"));
const ids = [...typeBlock.matchAll(/\| "([^"]+)"/g)].map(m => m[1]);
for (const id of ids) ok(new RegExp(`registerView\\("${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`).test(read(path.join(src, 'bot/views/modern.views.ts'))), `PanelViewId not registered: ${id}`);

const modern = read(path.join(src, 'bot/handlers/modern.ts'));
for (const m of modern.matchAll(/\["[^"]+", \{ id: "([^"]+)"/g)) ok(ids.includes(m[1]), `Command opens invalid PanelViewId: ${m[1]}`);

const reply = read(path.join(src, 'bot/keyboards/reply.keyboard.ts')) + '\n' + read(path.join(src, 'bot/keyboards/design-system.ts'));
for (const label of reply.matchAll(/text: labels\.([a-zA-Z0-9_]+)/g)) ok(reply.includes(`[labels.${label[1]}]`), `Visible reply label has no quick route: labels.${label[1]}`);

for (const f of files) {
  const text = read(f);
  for (const m of text.matchAll(/callback_data:\s*["'`]([^"'`]+)["'`]/g)) ok(Buffer.byteLength(m[1], 'utf8') <= 64, `Inline callback >64 bytes in ${rel(f)}: ${m[1]}`);
  for (const m of text.matchAll(/action:\s*["'`](home|shop|wallet|deposit|support|referral|account|free_config)["'`]/g)) ok(false, `New visible button uses legacy callback in ${rel(f)}: ${m[1]}`);
}
ok(modern.includes('Temporary compatibility redirects'), 'Legacy compatibility redirect comment missing');
ok(modern.includes('خرید با موفقیت تکمیل شد. اطلاعات اکانت در پیام بعدی ارسال شد') && modern.includes('ctx.reply(purchaseSuccessMessage'), 'Product purchase success must send credentials with ctx.reply');
ok(modern.includes('فاکتور پرداخت آماده شد') && modern.includes('InvoiceActionKeyboard'), 'Payment instruction SEND_NEW path missing');
ok(modern.includes('SupportService.addUserMessage') && modern.includes('SupportService.addAdminReply') && modern.match(/await ctx\.reply\("📩 پیام شما ارسال شد/) && modern.match(/await ctx\.reply\("✅ پاسخ ارسال شد/), 'Support chat SEND_NEW acknowledgements missing');
ok(!panelUi.includes('seenNav.has(callbackFor("home")) && seenNav.has(callbackFor("home"))'), 'Duplicate Home/Back guard malformed');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('navigation phase3 checks passed');
