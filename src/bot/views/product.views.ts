import { registerView, callbackFor } from "../navigation/panel-ui";
import { ProductService } from "../../modules/product/product.service";
import { formatXrayBytes } from "../../modules/xray/xray.service";
import { formatToman } from "../../utils/money";
import { formatStockLabel } from "../../utils/formatters";
import { productDetailViewKeyboard } from "../keyboards/view-keyboards";
import { navRow } from "../keyboards/panel-keyboard.helpers";
import { card, joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";
import { userLabels } from "../ui/labels";
import { uiIcons } from "../ui/icons";
import { errorMessage } from "../../utils/messages";

const money = formatToman;
const stockLabel = formatStockLabel;

const toFa = (value: number) => value.toLocaleString("fa-IR");

const productTrafficLabel = (product: { mode: string; trafficBytes?: bigint | number | null }) => {
  if (product.mode !== "xray_auto") return "موجودی دستی";
  return formatXrayBytes(product.trafficBytes ?? 0);
};

const productDurationLabel = (product: { durationDays?: number | null; duration?: number | null }) =>
  `${toFa(product.durationDays ?? product.duration ?? 0)} روز`;

const productModeLabel = (mode: string) => (mode === "xray_auto" ? "ساخت خودکار از پنل" : "تحویل از موجودی دستی");

const productButtonText = (product: { title: string; price: number }) => product.title.slice(0, 60);

export function registerProductViews() {
  registerView("shop", async () => {
    const categories = await ProductService.getCategories();
    const totalProducts = categories.reduce((sum, category) => sum + category.products.length, 0);

    return {
      replyKeyboard: "shop",
      text: joinSections([
        card("🛒 فروشگاه نیمه‌شب", ["سرویس موردنیاز خود را انتخاب کنید.", "تمام سرویس‌ها پس از پرداخت به‌صورت خودکار تحویل داده می‌شوند."]),
        card("📊 وضعیت فروشگاه", [`🗂 دسته‌بندی‌ها: ${toFa(categories.length)}`, `📦 سرویس‌های قابل خرید: ${toFa(totalProducts)}`]),
      ]),
      keyboard: [
        navRow({ text: "📋 مشاهده همه سرویس‌ها", view: "shop.categories" }, { text: "⭐ سرویس‌های پیشنهادی", view: "shop.recommended" }),
        [{ text: "🔎 جستجوی سرویس", action: "flow:start:product_search" }],
      ],
    };
  });

  registerView("shop.recommended", async () => {
    const categories = await ProductService.getCategories();
    const products = categories.flatMap((category) => category.products).slice(0, 6);

    return {
      replyKeyboard: "shop",
      text: joinSections([
        card("⭐ سرویس‌های پیشنهادی", [
          products.length ? "چند سرویس پرکاربرد برای خرید سریع آماده شده است." : "فعلاً سرویس پیشنهادی برای نمایش وجود ندارد.",
        ]),
      ]),
      keyboard: [
        ...products.map((product) => [
          {
            text: product.title,
            action: callbackFor("shop.product", { productId: product.id }),
          },
        ]),
        navRow({ text: "📋 مشاهده همه سرویس‌ها", view: "shop.categories" }),
      ],
    };
  });

  registerView("shop.categories", async () => {
    const categories = await ProductService.getCategories();

    return {
      replyKeyboard: "shop",
      text: joinSections([
        card(`${uiIcons.product} دسته‌بندی سرویس‌ها`, [
          categories.length ? "برای مشاهده سرویس‌ها، یک دسته‌بندی را انتخاب کنید." : "فعلاً دسته‌بندی فعالی برای نمایش وجود ندارد.",
        ]),
        section(sectionTitles.serviceSpecs, ["سرویس‌ها فعال، قابل خرید و آماده تحویل خودکار هستند."]),
      ]),
      keyboard: [
        [{ text: "🔎 جستجوی سرویس", action: "flow:start:product_search" }],
        ...categories.map((category) => [
          {
            text: `📁 ${category.name} · ${toFa(category.products.length)} سرویس`,
            action: callbackFor("shop.products", { categoryId: category.id }),
          },
        ]),
      ],
    };
  });

  registerView("shop.products", async (_ctx, params) => {
    const products = await ProductService.getProductsByCategory(params.categoryId);

    return {
      replyKeyboard: "shop",
      text: joinSections([
        card(userLabels.services, [
          products.length
            ? "یک سرویس را انتخاب کنید تا جزئیات، موجودی و مبلغ نهایی را ببینید."
            : "در این دسته‌بندی فعلاً سرویسی برای نمایش وجود ندارد.",
        ]),
      ]),
      keyboard: [
        ...products.map((product) => [
          {
            text: product.title,
            action: callbackFor("shop.product", { productId: product.id }),
          },
        ]),
      ],
    };
  });

  registerView("shop.searchResults", async (ctx, params) => {
    const query = params.q || ctx.session.productSearchQuery || "";
    const products = await ProductService.searchActiveProducts(query, 10);

    return {
      replyKeyboard: "shop",
      text: joinSections([
        card(`${uiIcons.info} نتیجه جستجو`, [
          `عبارت جستجو: ${query || "—"}`,
          products.length ? "از نتایج زیر یک سرویس را انتخاب کنید." : "موردی پیدا نشد. لطفاً با نام کوتاه‌تر سرویس یا دسته‌بندی دوباره جستجو کنید.",
        ]),
      ]),
      keyboard: [
        ...products.map((product) => [
          {
            text: product.title,
            action: callbackFor("shop.product", { productId: product.id }),
          },
        ]),
        [{ text: "🔎 جستجوی جدید", action: "flow:start:product_search" }],
        navRow({ text: "📋 مشاهده همه سرویس‌ها", view: "shop.categories" }),
      ],
    };
  });

  registerView("shop.product", async (ctx, params) => {
    const product = await ProductService.getActiveProductForUser(params.productId);

    if (!product) {
      return {
        replyKeyboard: "shop",
        text: errorMessage("محصول در دسترس نیست", "این سرویس در حال حاضر قابل خرید نیست یا غیرفعال شده است.", "لطفاً سرویس دیگری را انتخاب کنید."),
        keyboard: [navRow({ text: "📋 مشاهده سرویس‌ها", view: "shop.categories" })],
      };
    }

    const stock = await ProductService.availableStock(product.id);
    const duration = productDurationLabel(product);
    const traffic = productTrafficLabel(product);

    ctx.session.recentlyViewedProductIds = [product.id, ...(ctx.session.recentlyViewedProductIds ?? []).filter((id) => id !== product.id)].slice(
      0,
      6,
    );

    return {
      replyKeyboard: "shop",
      text: joinSections([
        card(`${uiIcons.product} ${product.title}`, [
          `🏷 دسته‌بندی: ${product.category?.name ?? "نامشخص"}`,
          `⚙️ نوع تحویل: ${productModeLabel(product.mode)}`,
          `🚀 تحویل: فوری و خودکار`,
          `📊 موجودی: ${stockLabel(stock)}`,
        ]),
        section(sectionTitles.traffic, [`📊 حجم سرویس: ${traffic}`]),
        section(sectionTitles.duration, [`📅 اعتبار سرویس: ${duration}`]),
        section(sectionTitles.price, [`💰 قیمت نهایی: ${money(product.price)}`]),
        section(sectionTitles.finalAmount, [`✅ مبلغ قابل پرداخت: ${money(product.price)}`]),
        card(`${uiIcons.info} راهنمای تحویل`, [
          "بعد از پرداخت، اطلاعات سرویس همین‌جا نمایش داده می‌شود.",
          "همچنین همیشه از بخش «سرویس‌های من» قابل مشاهده است.",
        ]),
      ]),
      keyboard: productDetailViewKeyboard(product.id, stock),
    };
  });
}
