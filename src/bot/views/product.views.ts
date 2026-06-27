import { registerView, callbackFor } from "../navigation/panel-ui";
import { ProductService } from "../../modules/product/product.service";
import { formatXrayBytes } from "../../modules/xray/xray.service";
import { formatToman } from "../../utils/money";
import { formatStockLabel } from "../../utils/formatters";
import { productDetailViewKeyboard } from "../keyboards/view-keyboards";
import { navRow } from "../keyboards/panel-keyboard.helpers";
import { card, joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";
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

const productButtonText = (product: { title: string; price: number }) => `📦 ${product.title} · ${money(product.price)}`.slice(0, 60);

const cleanOptionalText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && !/^(null|undefined)$/i.test(trimmed) ? trimmed : undefined;
};

export function registerProductViews() {
  registerView("shop", async () => {
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
    const category = await ProductService.getCategoryWithProducts(params.categoryId);

    if (!category) {
      return {
        replyKeyboard: "shop",
        text: errorMessage("دسته‌بندی پیدا نشد", "این دسته‌بندی در حال حاضر در دسترس نیست.", "لطفاً از لیست دسته‌بندی‌ها دوباره انتخاب کنید."),
        keyboard: [],
      };
    }

    const products = category.products;
    const description = cleanOptionalText(category.description);
    const categoryTitle = `${category.icon ?? "📁"} ${category.name}`;

    return {
      replyKeyboard: "shop",
      text: joinSections([
        card(categoryTitle, [
          ...(description ? ["📝 توضیحات", description] : []),
          "📦 محصولات این دسته‌بندی",
          "برای مشاهده جزئیات، موجودی و خرید، یک سرویس را انتخاب کنید.",
          `تعداد سرویس‌ها: ${toFa(products.length)}`,
          ...(products.length ? [] : ["فعلاً محصولی در این دسته‌بندی وجود ندارد."]),
        ]),
      ]),
      keyboard: [
        ...products.map((product) => [
          {
            text: productButtonText(product),
            action: callbackFor("shop.product", { productId: product.id }),
            tone: "primary" as const,
          },
        ]),
        ...(products.length ? [] : [[{ text: "🔎 جستجوی سرویس", action: "flow:start:product_search", tone: "primary" as const }]]),
      ],
    };
  });

  registerView("shop.product", async (ctx, params) => {
    const product = await ProductService.getActiveProductForUser(params.productId);

    if (!product) {
      return {
        replyKeyboard: "shop",
        text: errorMessage("محصول در دسترس نیست", "این سرویس در حال حاضر قابل خرید نیست یا غیرفعال شده است.", "لطفاً سرویس دیگری را انتخاب کنید."),
        keyboard: [navRow({ text: "📋 مشاهده سرویس‌ها", view: "shop" })],
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
