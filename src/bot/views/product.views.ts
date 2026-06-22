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
export function registerProductViews() {
  registerView("shop", async () => ({
    replyKeyboard: "shop",
    text: joinSections([card("🛒 خرید سرویس", ["مرحله خرید را انتخاب کنید."])]),
    keyboard: [navRow({ text: "📋 مشاهده همه", view: "shop.categories" }, { text: "⭐ سرویس‌های پیشنهادی", view: "shop.recommended" })],
  }));
  registerView("shop.recommended", async () => {
    const categories = await ProductService.getCategories();
    const products = categories.flatMap((category) => category.products).slice(0, 6);
    return {
      text: joinSections([
        card("⭐ سرویس‌های پیشنهادی", [products.length ? "یکی از سرویس‌های پیشنهادی را انتخاب کنید." : "فعلاً پیشنهادی برای نمایش نیست."]),
      ]),
      keyboard: products.map((product) => [{ text: product.title, action: callbackFor("shop.product", { productId: product.id }) }]),
    };
  });
  registerView("shop.categories", async () => {
    const categories = await ProductService.getCategories();
    return {
      replyKeyboard: "shop",
      text: joinSections([
        card(`${uiIcons.product} فروشگاه نیمه‌شب`, ["دسته‌بندی موردنظر را انتخاب کنید."]),
        section(sectionTitles.serviceSpecs, ["همه سرویس‌های نمایش‌داده‌شده فعال و آماده تحویل خودکار هستند."]),
      ]),
      keyboard: [
        [{ text: "🔎 جستجوی محصول", action: "flow:start:product_search" }],
        ...categories.map((category) => [
          {
            text: `📁 ${category.name} (${category.products.length.toLocaleString("fa-IR")})`,
            action: callbackFor("shop.products", { categoryId: category.id }),
          },
        ]),
      ],
    };
  });
  registerView("shop.products", async (_ctx, params) => {
    const products = await ProductService.getProductsByCategory(params.categoryId);
    return {
      text: joinSections([card(userLabels.services, ["یک سرویس را انتخاب کنید تا جزئیات، موجودی و پیش‌فاکتور را ببینید."])]),
      keyboard: products.map((product) => [
        {
          text: product.title,
          action: callbackFor("shop.product", { productId: product.id }),
        },
      ]),
    };
  });
  registerView("shop.searchResults", async (ctx, params) => {
    const query = params.q || ctx.session.productSearchQuery || "";
    const products = await ProductService.searchActiveProducts(query, 10);
    return {
      text: joinSections([
        card(`${uiIcons.info} نتیجه جستجو`, [
          `عبارت: ${query || "—"}`,
          products.length ? "از نتایج زیر یک محصول را انتخاب کنید:" : "موردی پیدا نشد. لطفاً با نام کوتاه‌تر سرویس یا دسته‌بندی دوباره جستجو کنید.",
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
      ],
    };
  });
  registerView("shop.product", async (ctx, params) => {
    const product = await ProductService.getActiveProductForUser(params.productId);
    if (!product)
      return {
        text: errorMessage("محصول در دسترس نیست", "این محصول در حال حاضر قابل خرید نیست.", "لطفاً محصول دیگری را انتخاب کنید."),
        keyboard: [],
      };
    const stock = await ProductService.availableStock(product.id);
    ctx.session.recentlyViewedProductIds = [product.id, ...(ctx.session.recentlyViewedProductIds ?? []).filter((id) => id !== product.id)].slice(
      0,
      6,
    );
    return {
      text: joinSections([
        card(`${uiIcons.product} ${product.title}`, [
          `🏷 دسته‌بندی: ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}`,
          `⚙️ نوع محصول: ${product.mode === "xray_auto" ? "ساخت خودکار از پنل Xray" : "موجودی دستی"}`,
          `🚀 تحویل: فوری و خودکار`,
          `📊 موجودی: ${stockLabel(stock)}`,
          `📅 اعتبار سرویس: ${(product.durationDays ?? product.duration).toLocaleString("fa-IR")} روز`,
          `📊 حجم: ${product.mode === "xray_auto" ? formatXrayBytes(product.trafficBytes) : "—"}`,
        ]),
        section(sectionTitles.traffic, [product.mode === "xray_auto" ? formatXrayBytes(product.trafficBytes) : undefined]),
        section(sectionTitles.duration, [`${(product.durationDays ?? product.duration).toLocaleString("fa-IR")} روز`]),
        section(sectionTitles.price, [`قیمت پایه: ${money(product.price)}`]),
        section(sectionTitles.finalAmount, [`💰 قیمت نهایی: ${money(product.price)}`]),
        card(`${uiIcons.info} راهنما`, ["پس از پرداخت، اطلاعات اکانت همین‌جا نمایش داده می‌شود و همیشه از بخش «اکانت‌های من» قابل مشاهده است."]),
      ]),
      keyboard: productDetailViewKeyboard(product.id, stock),
    };
  });
}
