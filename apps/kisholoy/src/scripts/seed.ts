import fs from "fs"
import path from "path"

import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createPromotionsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateProductsWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * ---------------------------------------------------------------------------
 * Kisholoy demo catalog
 * ---------------------------------------------------------------------------
 *
 * The catalog is deliberately product-agnostic: the taxonomy below spans food,
 * handmade goods, beauty, kitchen, fashion, electronics and stationery, and
 * nothing in the data model is specific to any of them. Adding a 22nd product
 * in a brand new category is a matter of adding an entry to `CATEGORIES` and
 * `PRODUCTS` - no schema change.
 *
 * In-house vs third-party is carried in product `metadata`:
 *   selling_model: "in_house" | "third_party"
 *   vendor_id / vendor_name / commission_rate (third party only)
 *   cost_price_minor (in-house only, for margin reporting)
 * Stock for each product is held at the stock location of whoever owns it, so
 * vendor inventory and in-house inventory never mix.
 */

const CURRENCY = "bdt"
const COUNTRY = "bd"
const SALES_CHANNEL = "Kisholoy Webstore"

type Vendor = {
  id: string
  name: string
  /** Stock location name for this vendor's fulfilment. */
  location: string
  commissionRate?: number
}

const VENDORS: Record<string, Vendor> = {
  kisholoy: {
    id: "kisholoy",
    name: "Kisholoy (in-house)",
    location: "Kisholoy Central Warehouse",
  },
  "shundor-naturals": {
    id: "shundor-naturals",
    name: "Shundor Naturals",
    location: "Shundor Naturals — Vendor Stock",
    commissionRate: 15,
  },
  "nokshi-shilpo": {
    id: "nokshi-shilpo",
    name: "Nokshi Shilpo",
    location: "Nokshi Shilpo — Vendor Stock",
    commissionRate: 20,
  },
  "deshi-rannaghor": {
    id: "deshi-rannaghor",
    name: "Deshi Rannaghor",
    location: "Deshi Rannaghor — Vendor Stock",
    commissionRate: 18,
  },
}

type CategorySeed = { name: string; children?: string[] }

const CATEGORIES: CategorySeed[] = [
  {
    name: "Food & Grocery",
    children: [
      "Snacks & Sweets",
      "Condiments & Sauces",
      "Honey & Spreads",
      "Beverages",
    ],
  },
  {
    name: "Handmade & Crafts",
    children: ["Home Décor", "Handwoven Textiles"],
  },
  { name: "Beauty & Personal Care" },
  { name: "Home & Kitchen" },
  { name: "Fashion & Accessories" },
  { name: "Electronics & Accessories" },
  { name: "Stationery & Gifts" },
]

type VariantSeed = {
  title: string
  sku: string
  /** Selling price in the currency's minor units (taka x 100). */
  price: number
  /** Optional compare-at price, in minor units. */
  compareAt?: number
  options: Record<string, string>
}

type ProductSeed = {
  title: string
  subtitle: string
  handle: string
  description: string
  category: string
  vendor: keyof typeof VENDORS
  unit: string
  status: ProductStatus
  /** Stocked quantity per variant, keyed by SKU. */
  stock: Record<string, number>
  variants: VariantSeed[]
  options: { title: string; values: string[] }[]
  metadata: Record<string, unknown>
}

const taka = (amount: number) => Math.round(amount * 100)

const PRODUCTS: ProductSeed[] = [
  {
    title: "Chui Jhal (Bangladesh Pepper Sticks)",
    subtitle: "Sun-dried Piper chaba sticks, 50 g",
    handle: "chui-jhal-50g",
    description:
      "The woody stem of the Piper chaba plant, dried and cut into sticks. Shaved into beef or mutton curry it gives the sharp, citrusy heat that defines much of southern Bangladeshi cooking. Harvested and dried in the south, packed in a resealable kraft pouch.",
    category: "Snacks & Sweets",
    vendor: "kisholoy",
    unit: "50 g pouch",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-CHJ-050": 120 },
    options: [{ title: "Pack size", values: ["50 g"] }],
    variants: [
      {
        title: "50 g",
        sku: "KSH-FOO-CHJ-050",
        price: taka(180),
        compareAt: taka(210),
        options: { "Pack size": "50 g" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(96),
      return_eligible: false,
      shelf_life_months: 12,
      storage: "Cool, dry place away from sunlight",
      origin: "Bagerhat, Bangladesh",
      tags: ["spice", "traditional", "cooking"],
    },
  },
  {
    title: "Sundarbans Wild Honey (Khalisha)",
    subtitle: "Raw, unfiltered forest honey, 500 g",
    handle: "sundarbans-honey-500g",
    description:
      "Raw honey collected from khalisha mangrove blossom in the Sundarbans. Never heated, never blended, never filtered beyond a coarse sieve, so it keeps its pollen and its dark amber colour. Each jar is traceable to a collector group.",
    category: "Honey & Spreads",
    vendor: "shundor-naturals",
    unit: "500 g jar",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-HON-500": 45 },
    options: [{ title: "Size", values: ["500 g"] }],
    variants: [
      {
        title: "500 g",
        sku: "KSH-FOO-HON-500",
        price: taka(1450),
        compareAt: taka(1650),
        options: { Size: "500 g" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: false,
      shelf_life_months: 24,
      storage: "Room temperature, do not refrigerate",
      origin: "Sundarbans, Khulna",
      certification: "Wild-harvested, non-organic",
      tags: ["honey", "raw", "sundarbans"],
    },
  },
  {
    title: "Handmade Mango Pickle (Aamer Achar)",
    subtitle: "Small-batch, mustard oil, 400 g",
    handle: "mango-pickle-400g",
    description:
      "Green mango cured in mustard oil with panchagarh chilli, fenugreek and nigella. Made in 20 kg batches and sun-matured for three weeks. No vinegar, no preservatives, no added colour.",
    category: "Condiments & Sauces",
    vendor: "deshi-rannaghor",
    unit: "400 g jar",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-PIC-400": 60 },
    options: [{ title: "Size", values: ["400 g"] }],
    variants: [
      {
        title: "400 g",
        sku: "KSH-FOO-PIC-400",
        price: taka(420),
        options: { Size: "400 g" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: false,
      shelf_life_months: 9,
      allergens: ["mustard oil"],
      tags: ["pickle", "handmade", "spicy"],
    },
  },
  {
    title: "Handmade Chocolate Dry Cake",
    subtitle: "Baked to order, 250 g",
    handle: "chocolate-dry-cake-250g",
    description:
      "A dense, buttery dry cake with real cocoa and no cream filling, so it travels well. Baked twice a week in a home kitchen licensed by the local food authority.",
    category: "Snacks & Sweets",
    vendor: "deshi-rannaghor",
    unit: "250 g loaf",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-CAK-250": 80 },
    options: [{ title: "Size", values: ["250 g"] }],
    variants: [
      {
        title: "250 g",
        sku: "KSH-FOO-CAK-250",
        price: taka(320),
        options: { Size: "250 g" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: false,
      shelf_life_days: 7,
      allergens: ["wheat", "egg", "dairy"],
      tags: ["cake", "baked", "handmade"],
    },
  },
  {
    title: "Butter Biscuits",
    subtitle: "Shortbread style, 200 g",
    handle: "butter-biscuits-200g",
    description:
      "Crumbly shortbread-style biscuits made with dairy butter and no palm oil. Twenty biscuits per pack, sealed with a desiccant for a long shelf life.",
    category: "Snacks & Sweets",
    vendor: "kisholoy",
    unit: "200 g pack",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-BIS-200": 200 },
    options: [{ title: "Size", values: ["200 g"] }],
    variants: [
      {
        title: "200 g",
        sku: "KSH-FOO-BIS-200",
        price: taka(160),
        options: { Size: "200 g" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(98),
      return_eligible: false,
      shelf_life_months: 6,
      allergens: ["wheat", "dairy"],
      tags: ["biscuit", "tea-time"],
    },
  },
  {
    title: "Chanachur Savoury Snack Mix",
    subtitle: "Lentil, peanut and puffed rice, 250 g",
    handle: "chanachur-mix-250g",
    description:
      "The classic street-side mix: fried lentils, chickpeas, peanuts, puffed rice and curry leaf, tossed with chilli and black salt. Medium heat.",
    category: "Snacks & Sweets",
    vendor: "kisholoy",
    unit: "250 g pack",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-CHA-250": 150 },
    options: [{ title: "Size", values: ["250 g"] }],
    variants: [
      {
        title: "250 g",
        sku: "KSH-FOO-CHA-250",
        price: taka(140),
        options: { Size: "250 g" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(84),
      return_eligible: false,
      shelf_life_months: 4,
      allergens: ["peanut"],
      tags: ["snack", "spicy", "namkeen"],
    },
  },
  {
    title: "Sylhet Orange Leaf Black Tea",
    subtitle: "Loose leaf, single garden, 200 g",
    handle: "sylhet-leaf-tea-200g",
    description:
      "Bright, brisk orthodox black tea from a single Sylhet garden, plucked in the second flush. Loose leaf, not dust, so it brews clear and drinks well with or without milk.",
    category: "Beverages",
    vendor: "kisholoy",
    unit: "200 g pouch",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-TEA-200": 100 },
    options: [{ title: "Size", values: ["200 g"] }],
    variants: [
      {
        title: "200 g",
        sku: "KSH-FOO-TEA-200",
        price: taka(380),
        options: { Size: "200 g" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(210),
      return_eligible: false,
      shelf_life_months: 18,
      origin: "Sylhet, Bangladesh",
      tags: ["tea", "loose-leaf"],
    },
  },
  {
    title: "Single Origin Coffee Beans",
    subtitle: "Medium roast, whole bean, 250 g",
    handle: "single-origin-coffee-250g",
    description:
      "Arabica beans roasted to a medium profile within seven days of shipping. Notes of cocoa and orange peel, low acidity, suitable for filter or moka.",
    category: "Beverages",
    vendor: "kisholoy",
    unit: "250 g bag",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FOO-COF-250": 60 },
    options: [{ title: "Grind", values: ["Whole bean"] }],
    variants: [
      {
        title: "Whole bean",
        sku: "KSH-FOO-COF-250",
        price: taka(720),
        compareAt: taka(850),
        options: { Grind: "Whole bean" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(430),
      return_eligible: false,
      shelf_life_months: 6,
      roast_level: "medium",
      tags: ["coffee", "beans"],
    },
  },
  {
    title: "Curated Festive Gift Box",
    subtitle: "Honey, tea, biscuits and a hand-poured candle",
    handle: "festive-gift-box",
    description:
      "A ready-to-send gift box assembled from the catalog: Sundarbans honey, Sylhet tea, butter biscuits and a hand-poured candle, packed in a rigid box with jute ribbon and a handwritten note card.",
    category: "Stationery & Gifts",
    vendor: "kisholoy",
    unit: "1 box",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-GFT-BOX-CLS": 30, "KSH-GFT-BOX-PRM": 12 },
    options: [{ title: "Edition", values: ["Classic", "Premium"] }],
    variants: [
      {
        title: "Classic",
        sku: "KSH-GFT-BOX-CLS",
        price: taka(2450),
        options: { Edition: "Classic" },
      },
      {
        title: "Premium",
        sku: "KSH-GFT-BOX-PRM",
        price: taka(3950),
        compareAt: taka(4400),
        options: { Edition: "Premium" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(1600),
      return_eligible: true,
      return_window_days: 7,
      gift_wrappable: true,
      tags: ["gift", "festive", "bundle"],
    },
  },
  {
    title: "Nakshi Kantha Cushion Cover",
    subtitle: "Hand-stitched, cotton, 2 sizes",
    handle: "nakshi-kantha-cushion-cover",
    description:
      "Traditional nakshi kantha running stitch worked by hand over three to five days on handloom cotton. Hidden zip, insert not included. Because each piece is stitched by hand, no two are identical.",
    category: "Home Décor",
    vendor: "nokshi-shilpo",
    unit: "1 cover",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-HOM-KAN-16": 40, "KSH-HOM-KAN-20": 25 },
    options: [{ title: "Size", values: ['16" x 16"', '20" x 20"'] }],
    variants: [
      {
        title: '16" x 16"',
        sku: "KSH-HOM-KAN-16",
        price: taka(1250),
        options: { Size: '16" x 16"' },
      },
      {
        title: '20" x 20"',
        sku: "KSH-HOM-KAN-20",
        price: taka(1550),
        options: { Size: '20" x 20"' },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: true,
      return_window_days: 14,
      material: "100% cotton",
      care: "Hand wash cold, dry in shade",
      handmade: true,
      tags: ["kantha", "handmade", "decor"],
    },
  },
  {
    title: "Terracotta Serving Bowl",
    subtitle: "Wheel-thrown, food safe glaze, 20 cm",
    handle: "terracotta-serving-bowl",
    description:
      "Wheel-thrown from local clay and fired twice, finished with a food-safe glaze inside. Suitable for serving, not for direct flame.",
    category: "Home Décor",
    vendor: "nokshi-shilpo",
    unit: "1 bowl",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-HOM-TER-020": 55 },
    options: [{ title: "Diameter", values: ["20 cm"] }],
    variants: [
      {
        title: "20 cm",
        sku: "KSH-HOM-TER-020",
        price: taka(890),
        options: { Diameter: "20 cm" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: true,
      return_window_days: 14,
      dimensions_cm: { diameter: 20, height: 9 },
      weight_g: 640,
      handmade: true,
      tags: ["terracotta", "handmade", "serving"],
    },
  },
  {
    title: "Handloom Cotton Gamcha (Set of 2)",
    subtitle: "Traditional check weave, 80 x 180 cm",
    handle: "handloom-gamcha-set",
    description:
      "Two handloom-woven cotton gamchas in the classic red and white check. Soft after the first wash, useful as a towel, a wrap or a table runner.",
    category: "Handwoven Textiles",
    vendor: "nokshi-shilpo",
    unit: "Set of 2",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FAS-GAM-002": 120 },
    options: [{ title: "Colour", values: ["Red check"] }],
    variants: [
      {
        title: "Red check",
        sku: "KSH-FAS-GAM-002",
        price: taka(640),
        options: { Colour: "Red check" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: true,
      return_window_days: 14,
      material: "100% cotton",
      care: "Machine wash warm, tumble dry low",
      tags: ["gamcha", "handloom", "textile"],
    },
  },
  {
    title: "Cold-Pressed Coconut Hair Oil",
    subtitle: "Unrefined, 200 ml",
    handle: "coconut-hair-oil-200ml",
    description:
      "Cold-pressed from fresh coconut kernel, unrefined and unscented. Nothing added, nothing removed. Comes in an amber glass bottle to slow oxidation.",
    category: "Beauty & Personal Care",
    vendor: "shundor-naturals",
    unit: "200 ml bottle",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-BEA-COC-200": 70 },
    options: [{ title: "Size", values: ["200 ml"] }],
    variants: [
      {
        title: "200 ml",
        sku: "KSH-BEA-COC-200",
        price: taka(560),
        options: { Size: "200 ml" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: false,
      shelf_life_months: 12,
      ingredients: ["Cocos nucifera oil"],
      tags: ["hair oil", "natural", "beauty"],
    },
  },
  {
    title: "Neem & Turmeric Herbal Soap",
    subtitle: "Cold process, 100 g bar",
    handle: "neem-turmeric-soap-100g",
    description:
      "Cold-process bar cured for four weeks with neem leaf infusion and turmeric. Palm-oil free, unscented apart from the neem itself.",
    category: "Beauty & Personal Care",
    vendor: "shundor-naturals",
    unit: "100 g bar",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-BEA-SOA-100": 300 },
    options: [{ title: "Pack", values: ["Single bar"] }],
    variants: [
      {
        title: "Single bar",
        sku: "KSH-BEA-SOA-100",
        price: taka(180),
        options: { Pack: "Single bar" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: false,
      shelf_life_months: 18,
      vegan: true,
      tags: ["soap", "herbal", "beauty"],
    },
  },
  {
    title: "Bamboo Kitchen Utensil Set",
    subtitle: "Five pieces, untreated bamboo",
    handle: "bamboo-utensil-set",
    description:
      "Spatula, serving spoon, slotted spoon, turner and tongs, cut from a single species of untreated bamboo. Will not scratch non-stick coatings.",
    category: "Home & Kitchen",
    vendor: "kisholoy",
    unit: "Set of 5",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-HOM-BAM-005": 65 },
    options: [{ title: "Set", values: ["5 pieces"] }],
    variants: [
      {
        title: "5 pieces",
        sku: "KSH-HOM-BAM-005",
        price: taka(980),
        options: { Set: "5 pieces" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(560),
      return_eligible: true,
      return_window_days: 14,
      material: "Bamboo",
      care: "Hand wash, dry immediately",
      tags: ["kitchen", "bamboo", "sustainable"],
    },
  },
  {
    title: "Insulated Steel Water Bottle",
    subtitle: "Double wall, 1 litre",
    handle: "steel-water-bottle-1l",
    description:
      "Double-walled 18/8 stainless steel, keeps drinks cold for about 18 hours. Leak-proof lid, wide mouth for ice, powder-coated outside.",
    category: "Home & Kitchen",
    vendor: "kisholoy",
    unit: "1 bottle",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-HOM-BOT-100": 140 },
    options: [{ title: "Capacity", values: ["1 litre"] }],
    variants: [
      {
        title: "1 litre",
        sku: "KSH-HOM-BOT-100",
        price: taka(850),
        compareAt: taka(990),
        options: { Capacity: "1 litre" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(520),
      return_eligible: true,
      return_window_days: 14,
      warranty_months: 6,
      weight_g: 480,
      tags: ["bottle", "kitchen", "outdoor"],
    },
  },
  {
    title: "Jamdani Cotton Scarf",
    subtitle: "Handwoven supplementary weft, 70 x 180 cm",
    handle: "jamdani-cotton-scarf",
    description:
      "Handwoven jamdani on a pit loom, the motif built in by supplementary weft rather than printed. A single scarf takes a weaver two to three days.",
    category: "Fashion & Accessories",
    vendor: "nokshi-shilpo",
    unit: "1 scarf",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FAS-JAM-001": 25 },
    options: [{ title: "Colour", values: ["Indigo"] }],
    variants: [
      {
        title: "Indigo",
        sku: "KSH-FAS-JAM-001",
        price: taka(1950),
        options: { Colour: "Indigo" },
      },
    ],
    metadata: {
      selling_model: "third_party",
      return_eligible: true,
      return_window_days: 14,
      material: "100% cotton",
      handmade: true,
      care: "Dry clean or hand wash cold",
      tags: ["jamdani", "scarf", "handwoven"],
    },
  },
  {
    title: "Leather Card Wallet",
    subtitle: "Full-grain leather, six slots",
    handle: "leather-card-wallet",
    description:
      "Six card slots and a centre note pocket in full-grain leather, hand-stitched and edge-burnished. Develops a patina with use.",
    category: "Fashion & Accessories",
    vendor: "kisholoy",
    unit: "1 wallet",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-FAS-WAL-001": 80 },
    options: [{ title: "Colour", values: ["Tan"] }],
    variants: [
      {
        title: "Tan",
        sku: "KSH-FAS-WAL-001",
        price: taka(1150),
        options: { Colour: "Tan" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(640),
      return_eligible: true,
      return_window_days: 14,
      warranty_months: 12,
      material: "Full-grain leather",
      tags: ["wallet", "leather", "accessory"],
    },
  },
  {
    title: "Braided USB-C Cable",
    subtitle: "1.5 m, 60 W, nylon braided",
    handle: "usbc-cable-1-5m",
    description:
      "USB-C to USB-C cable rated at 60 W and 480 Mbps, with a nylon braid and strain-relieved ends. Two metres of slack is a lie; this one is a measured 1.5 m.",
    category: "Electronics & Accessories",
    vendor: "kisholoy",
    unit: "1 cable",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-ELC-USC-BLK": 220, "KSH-ELC-USC-WHT": 180 },
    options: [{ title: "Colour", values: ["Black", "White"] }],
    variants: [
      {
        title: "Black",
        sku: "KSH-ELC-USC-BLK",
        price: taka(480),
        options: { Colour: "Black" },
      },
      {
        title: "White",
        sku: "KSH-ELC-USC-WHT",
        price: taka(480),
        options: { Colour: "White" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(240),
      return_eligible: true,
      return_window_days: 7,
      warranty_months: 12,
      specs: { power_w: 60, data_mbps: 480, length_m: 1.5 },
      tags: ["usb-c", "cable", "electronics"],
    },
  },
  {
    title: "Power Bank 20000 mAh",
    subtitle: "22.5 W fast charge, dual output",
    handle: "power-bank-20000mah",
    description:
      "Twenty thousand milliamp-hours in a pocketable shell, with 22.5 W USB-C output, a second USB-A port and a four-step charge display. Airline carry-on compliant.",
    category: "Electronics & Accessories",
    vendor: "kisholoy",
    unit: "1 unit",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-ELC-PWB-200": 60 },
    options: [{ title: "Capacity", values: ["20000 mAh"] }],
    variants: [
      {
        title: "20000 mAh",
        sku: "KSH-ELC-PWB-200",
        price: taka(2350),
        compareAt: taka(2600),
        options: { Capacity: "20000 mAh" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(1650),
      return_eligible: true,
      return_window_days: 7,
      warranty_months: 12,
      specs: { capacity_mah: 20000, output_w: 22.5, ports: 2 },
      tags: ["power bank", "electronics"],
    },
  },
  {
    title: "Handmade Paper Notebook",
    subtitle: "A5, 120 pages, cotton rag paper",
    handle: "handmade-paper-notebook-a5",
    description:
      "Bound by hand with a cotton rag paper made from offcuts, so the sheets have a soft deckle edge. Lay-flat binding, no lined ruling.",
    category: "Stationery & Gifts",
    vendor: "kisholoy",
    unit: "1 notebook",
    status: ProductStatus.PUBLISHED,
    stock: { "KSH-STA-NOT-A50": 90 },
    options: [{ title: "Format", values: ["A5 unruled"] }],
    variants: [
      {
        title: "A5 unruled",
        sku: "KSH-STA-NOT-A50",
        price: taka(350),
        options: { Format: "A5 unruled" },
      },
    ],
    metadata: {
      selling_model: "in_house",
      cost_price_minor: taka(170),
      return_eligible: true,
      return_window_days: 14,
      pages: 120,
      size: "A5",
      tags: ["notebook", "stationery", "handmade"],
    },
  },
]

/**
 * Demo product photography lives in this repository under
 * `static/products/<handle>.jpg` and is served by the backend at
 * `/static/products/<handle>.jpg`. Keeping the images next to the seed keeps
 * the URLs same-origin (no third-party image host to break, no copyright
 * question) and out of the database (no base64 blobs).
 *
 * If a product's own photograph has not been produced yet, the shared
 * placeholder is used instead so no product page ever shows a broken image.
 */
const imageFor = (handle: string, backendUrl: string): string => {
  const staticDir = path.join(process.cwd(), "static", "products")
  const fileName = fs.existsSync(path.join(staticDir, `${handle}.jpg`))
    ? `${handle}.jpg`
    : "_placeholder.jpg"

  return `${backendUrl}/static/products/${fileName}`
}

const updateStoreCurrencies = createWorkflow(
  "kisholoy-update-store-currencies",
  (input: {
    store_id: string
    supported_currencies: { currency_code: string; is_default?: boolean }[]
  }) => {
    const normalizedInput = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map(
          (currency) => ({
            currency_code: currency.currency_code,
            is_default: currency.is_default ?? false,
          })
        ),
      },
    }))

    const stores = updateStoresStep(normalizedInput)

    return new WorkflowResponse(stores)
  }
)

export default async function seedKisholoy({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const storeModuleService = container.resolve(Modules.STORE)
  const regionModuleService = container.resolve(Modules.REGION)
  const promotionModuleService = container.resolve(Modules.PROMOTION)

  const backendUrl = (
    process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"
  ).replace(/\/$/, "")

  logger.info("[seed] 1/9 store, sales channel and currency")

  const [store] = await storeModuleService.listStores()

  let [salesChannel] = await salesChannelModuleService.listSalesChannels({
    name: SALES_CHANNEL,
  })

  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: SALES_CHANNEL }] },
    })
    salesChannel = result[0]
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [{ currency_code: CURRENCY, is_default: true }],
    },
  })

  logger.info("[seed] 2/9 stock locations (one per vendor, plus in-house)")

  const locationsByName = new Map<string, { id: string }>()

  for (const vendor of Object.values(VENDORS)) {
    const { data: existingLocations } = await query.graph({
      entity: "stock_location",
      fields: ["id", "name"],
      filters: { name: vendor.location },
    })
    const existing = (existingLocations as { id: string }[])[0]

    if (existing) {
      locationsByName.set(vendor.location, existing)
      continue
    }

    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: vendor.location,
            address: { city: "Khulna", country_code: "BD", address_1: "" },
          },
        ],
      },
    })

    locationsByName.set(vendor.location, result[0])

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: result[0].id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })

    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: result[0].id, add: [salesChannel.id] },
    })
  }

  const inHouseLocation = locationsByName.get(VENDORS.kisholoy.location) as {
    id: string
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: salesChannel.id,
        default_location_id: inHouseLocation.id,
      },
    },
  })

  logger.info("[seed] 3/9 region and tax region")

  let [region] = await regionModuleService.listRegions({ name: "Bangladesh" })

  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Bangladesh",
            currency_code: CURRENCY,
            countries: [COUNTRY],
            // The manual provider is Medusa's built-in "cash on delivery"
            // style provider. It never moves money.
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    region = result[0]
  }

  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id"],
    filters: { country_code: COUNTRY },
  })
  const taxRegion = (taxRegions as { id: string }[])[0]

  if (!taxRegion) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: COUNTRY, provider_id: "tp_system" }],
    })
  }

  logger.info("[seed] 4/9 shipping profile and delivery options")

  let [shippingProfile] = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  })

  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: {
        data: [{ name: "Default Shipping Profile", type: "default" }],
      },
    })
    shippingProfile = result[0]
  }

  let [fulfillmentSet] = await fulfillmentModuleService.listFulfillmentSets(
    { name: "Kisholoy Delivery" },
    { relations: ["service_zones"] }
  )

  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "Kisholoy Delivery",
      type: "shipping",
      service_zones: [
        {
          name: "Bangladesh",
          geo_zones: [{ country_code: COUNTRY, type: "country" }],
        },
      ],
    })
  }

  // Ensured on every run, not only when the set is created: `link.create` is
  // idempotent, and a set that exists without its location link makes every
  // shipping option fail with "providers are not enabled for the location".
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: inHouseLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  const serviceZoneId = fulfillmentSet.service_zones?.[0]?.id
  if (!serviceZoneId) {
    throw new Error(
      "[seed] Fulfilment set has no service zone; cannot create delivery options."
    )
  }

  const existingOptions = await fulfillmentModuleService.listShippingOptions()
  const existingOptionNames = new Set(existingOptions.map((o) => o.name))

  const deliveryOptions = [
    {
      name: "Standard Delivery",
      label: "Standard",
      description: "Delivered in 3-5 working days.",
      code: "standard",
      amount: taka(60),
    },
    {
      name: "Express Delivery",
      label: "Express",
      description: "Delivered within 48 hours inside Dhaka and Khulna.",
      code: "express",
      amount: taka(120),
    },
  ].filter((option) => !existingOptionNames.has(option.name))

  if (deliveryOptions.length) {
    await createShippingOptionsWorkflow(container).run({
      input: deliveryOptions.map((option) => ({
        name: option.name,
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: option.label,
          description: option.description,
          code: option.code,
        },
        prices: [
          { currency_code: CURRENCY, amount: option.amount },
          { region_id: region.id, amount: option.amount },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      })),
    })
  }

  logger.info("[seed] 5/9 publishable API key")

  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "token"],
    filters: { type: "publishable" },
  })

  let publishableApiKey = apiKeys?.[0] as
    | { id: string; token: string }
    | undefined

  if (!publishableApiKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          { title: "Kisholoy Storefront", type: "publishable", created_by: "" },
        ],
      },
    })
    publishableApiKey = result[0] as unknown as { id: string; token: string }
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [salesChannel.id] },
  })

  /**
   * Medusa auto-links a new publishable key to the store's default sales
   * channel. With two channels attached, every storefront request has to carry
   * an explicit `sales_channel_id`, which is a footgun for the next developer.
   * Keep exactly one channel on the key.
   */
  const allSalesChannels = await salesChannelModuleService.listSalesChannels()

  for (const channel of allSalesChannels) {
    if (channel.id === salesChannel.id) {
      continue
    }

    // Dismissing a link that does not exist is a no-op, so this is idempotent.
    await link.dismiss({
      [Modules.API_KEY]: { publishable_key_id: publishableApiKey.id },
      [Modules.SALES_CHANNEL]: { sales_channel_id: channel.id },
    })
  }

  logger.info("[seed] 6/9 categories")

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const categoriesByName = new Map<string, string>(
    (existingCategories as { id: string; name: string }[]).map((category) => [
      category.name,
      category.id,
    ])
  )

  const createCategories = (
    categories: { name: string; parent_category_id?: string | null }[]
  ) =>
    createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: categories.map((category) => ({
          name: category.name,
          is_active: true,
          parent_category_id: category.parent_category_id ?? null,
        })),
      },
    })

  const missingParents = CATEGORIES.filter(
    (category) => !categoriesByName.has(category.name)
  )

  if (missingParents.length) {
    const { result } = await createCategories(
      missingParents.map((category) => ({ name: category.name }))
    )
    result.forEach((category, index) =>
      categoriesByName.set(missingParents[index].name, category.id)
    )
  }

  for (const category of CATEGORIES) {
    const parentId = categoriesByName.get(category.name)
    const missingChildren = (category.children ?? []).filter(
      (child) => !categoriesByName.has(child)
    )

    if (!missingChildren.length) {
      continue
    }

    const { result } = await createCategories(
      missingChildren.map((child) => ({
        name: child,
        parent_category_id: parentId,
      }))
    )
    result.forEach((created, index) =>
      categoriesByName.set(missingChildren[index], created.id)
    )
  }

  logger.info("[seed] 7/9 products")

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  })
  const existingHandles = new Set(
    (existingProducts as { id: string; handle: string }[]).map(
      (product) => product.handle
    )
  )

  const toCreate = PRODUCTS.filter(
    (product) => !existingHandles.has(product.handle)
  )
  const toUpdate = PRODUCTS.filter((product) =>
    existingHandles.has(product.handle)
  )

  if (toCreate.length) {
    await createProductsWorkflow(container).run({
      input: {
        products: toCreate.map((product) => ({
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          handle: product.handle,
          status: product.status,
          shipping_profile_id: shippingProfile.id,
          category_ids: [categoriesByName.get(product.category)!].filter(
            Boolean
          ) as string[],
          images: [{ url: imageFor(product.handle, backendUrl) }],
          options: product.options,
          variants: product.variants.map((variant) => ({
            title: variant.title,
            sku: variant.sku,
            options: variant.options,
            manage_inventory: true,
            prices: [
              { currency_code: CURRENCY, amount: variant.price },
              ...(variant.compareAt
                ? [
                    {
                      currency_code: CURRENCY,
                      amount: variant.compareAt,
                      rules: { price_type: "compare_at" },
                    },
                  ]
                : []),
            ],
          })),
          sales_channels: [{ id: salesChannel.id }],
          metadata: {
            ...product.metadata,
            vendor_id: VENDORS[product.vendor].id,
            vendor_name: VENDORS[product.vendor].name,
            ...(VENDORS[product.vendor].commissionRate
              ? {
                  commission_rate: VENDORS[product.vendor].commissionRate,
                }
              : {}),
            unit: product.unit,
            seo_title: `${product.title} | Kisholoy`,
            seo_description: product.subtitle,
            alt_text: product.subtitle,
          },
        })),
      },
    })
  }

  if (toUpdate.length) {
    // Re-running the seed refreshes demo imagery without touching prices or
    // stock, so it is safe to run after replacing placeholder photography.
    const { data: byHandle } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { handle: toUpdate.map((product) => product.handle) },
    })
    const idByHandle = new Map(
      (byHandle as { id: string; handle: string }[]).map((product) => [
        product.handle,
        product.id,
      ])
    )

    await updateProductsWorkflow(container).run({
      input: {
        selector: {},
        update: toUpdate.map((product) => ({
          id: idByHandle.get(product.handle)!,
          images: [{ url: imageFor(product.handle, backendUrl) }],
        })),
      },
    })
  }

  logger.info("[seed] 8/9 inventory levels at the owning location")

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  })
  const itemBySku = new Map(
    (inventoryItems as { id: string; sku: string }[]).map((item) => [
      item.sku,
      item.id,
    ])
  )

  const inventoryModuleService = container.resolve(Modules.INVENTORY)
  const itemIds = [...itemBySku.values()]

  const existingLevels = itemIds.length
    ? await inventoryModuleService.listInventoryLevels(
        { inventory_item_id: itemIds },
        { take: null }
      )
    : []

  const existingLevelKeys = new Set(
    existingLevels.map(
      (level) => `${level.inventory_item_id}:${level.location_id}`
    )
  )

  const inventoryLevels: CreateInventoryLevelInput[] = []

  for (const product of PRODUCTS) {
    const location = locationsByName.get(VENDORS[product.vendor].location) as {
      id: string
    }

    for (const variant of product.variants) {
      const itemId = itemBySku.get(variant.sku)
      const stockedQuantity = product.stock[variant.sku]

      if (!itemId || stockedQuantity === undefined) {
        logger.warn(
          `[seed] skipped inventory for ${variant.sku}: ` +
            `${!itemId ? "no inventory item" : "no stock defined"}`
        )
        continue
      }

      if (existingLevelKeys.has(`${itemId}:${location.id}`)) {
        continue
      }

      inventoryLevels.push({
        inventory_item_id: itemId,
        location_id: location.id,
        stocked_quantity: stockedQuantity,
      })
    }
  }

  if (inventoryLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryLevels },
    })
  }

  logger.info("[seed] 9/10 coupons")

  /**
   * Two demo coupons. Both are validated server side by the promotion module:
   * the storefront only ever sends the code, never a discount amount, and an
   * expired/inactive/over-limit code is rejected when it is applied to a cart.
   *
   * `limit` is the global usage cap. A per-customer cap and a maximum discount
   * amount need a campaign budget, which is created through the admin under
   * Promotions > Campaigns.
   */
  const couponSeeds = [
    {
      code: "KISHOLOY10",
      application_method: {
        type: "percentage" as const,
        target_type: "order" as const,
        value: 10,
        currency_code: CURRENCY,
      },
      limit: 500,
    },
    {
      code: "FREESHIP60",
      application_method: {
        type: "fixed" as const,
        target_type: "shipping_methods" as const,
        allocation: "across" as const,
        value: taka(60),
        currency_code: CURRENCY,
      },
      limit: 1000,
    },
  ]

  const existingPromotions = await promotionModuleService.listPromotions()
  const existingCodes = new Set(
    existingPromotions.map((promotion) => promotion.code)
  )

  const couponsToCreate = couponSeeds.filter(
    (coupon) => !existingCodes.has(coupon.code)
  )

  if (couponsToCreate.length) {
    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: couponsToCreate.map((coupon) => ({
          code: coupon.code,
          type: "standard" as const,
          status: "active" as const,
          is_automatic: false,
          limit: coupon.limit,
          application_method: coupon.application_method,
        })),
      },
    })
  }

  logger.info("[seed] 10/10 summary")

  const promotionsAfter = await promotionModuleService.listPromotions()

  logger.info(
    `[seed] done — products: ${PRODUCTS.length} (${toCreate.length} created, ${toUpdate.length} refreshed), ` +
      `inventory levels: ${inventoryLevels.length} created, ` +
      `categories: ${categoriesByName.size}, stock locations: ${locationsByName.size}, ` +
      `promotions: ${promotionsAfter.length}`
  )
  logger.info(
    `[seed] publishable API key: ${publishableApiKey.token} ` +
      `(needed by the storefront as MEDUSA_PUBLISHABLE_KEY)`
  )
}
