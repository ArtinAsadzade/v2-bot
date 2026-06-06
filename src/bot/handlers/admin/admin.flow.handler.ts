import { prisma } from "../../../services/prisma";
import { resetFlow, getFlow } from "./admin.flow";

export async function handleAdminFlow(ctx: any) {
  const flow = getFlow(ctx);
  if (!flow) return false;

  const text = ctx.message?.text;
  if (!text) return false;

  // ---------------- PRODUCT CREATE ----------------
  if (flow.flow === "product_create") {
    if (flow.step === "title") {
      flow.data.title = text;
      flow.step = "price";
      return ctx.reply("💰 Price:");
    }

    if (flow.step === "price") {
      flow.data.price = Number(text);
      flow.step = "category";

      const cats = await prisma.category.findMany();

      return ctx.reply("📂 Select category:", {
        reply_markup: {
          inline_keyboard: cats.map((c) => [{ text: c.name, callback_data: `cat:${c.id}` }]),
        },
      });
    }
  }

  // ---------------- COUPON CREATE ----------------
  if (flow.flow === "coupon_create") {
    if (flow.step === "code") {
      flow.data.code = text;
      flow.step = "discount";
      return ctx.reply("📉 Discount %:");
    }

    if (flow.step === "discount") {
      flow.data.discountPercent = Number(text);
      flow.step = "maxUses";
      return ctx.reply("🔁 Max uses:");
    }

    if (flow.step === "maxUses") {
      flow.data.maxUses = Number(text);
      flow.step = "days";
      return ctx.reply("📆 Valid days:");
    }

    if (flow.step === "days") {
      flow.data.days = Number(text);

      const coupon = await prisma.coupon.create({
        data: {
          code: flow.data.code,
          discountPercent: flow.data.discountPercent,
          maxUses: flow.data.maxUses,
          expiresAt: new Date(Date.now() + flow.data.days * 86400000),
        },
      });

      resetFlow(ctx);

      return ctx.reply(`✅ Coupon created: ${coupon.code}`);
    }
  }

  // ---------------- ACCOUNT CREATE ----------------
  if (flow.flow === "account_create") {
    const [username, password, config] = text.split("|");

    await prisma.account.create({
      data: {
        productId: flow.data.productId,
        username,
        password,
        config,
      },
    });

    resetFlow(ctx);

    return ctx.reply("✅ Account added");
  }

  return false;
}
