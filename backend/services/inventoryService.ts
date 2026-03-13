/**
 * Inventory Service — tracks product stock for Deepak Fertilisers.
 * In-memory MVP; replace with database in production.
 */

interface InventoryItem {
    product: string;
    /** Product name in Marathi for agent reference */
    productMr: string;
    /** Current stock in bags */
    stock: number;
    /** Price per bag in INR */
    pricePerBag: number;
}

const inventory: InventoryItem[] = [
    { product: 'NPK 19-19-19', productMr: 'एनपीके 19-19-19', stock: 500, pricePerBag: 1200 },
    { product: 'NPK 00-52-34', productMr: 'एनपीके 00-52-34', stock: 300, pricePerBag: 1500 },
    { product: 'NPK 13-00-45', productMr: 'एनपीके 13-00-45', stock: 250, pricePerBag: 1350 },
    { product: 'Mahadhan Smartek', productMr: 'महाधन स्मार्टेक', stock: 400, pricePerBag: 1800 },
    { product: 'Mahadhan Nitrogen Booster', productMr: 'महाधन नायट्रोजन बूस्टर', stock: 200, pricePerBag: 950 },
];

/** Check if product is in stock for given quantity */
export function checkStock(product: string, quantity: number): boolean {
    const item = inventory.find(
        (i) => i.product.toLowerCase() === product.toLowerCase()
    );
    if (!item) return false;
    return item.stock >= quantity;
}

/** Reduce stock after confirmed order */
export function reduceStock(product: string, quantity: number): boolean {
    const item = inventory.find(
        (i) => i.product.toLowerCase() === product.toLowerCase()
    );
    if (!item || item.stock < quantity) return false;
    item.stock -= quantity;
    console.log(`[Inventory] ${product}: reduced by ${quantity}, remaining: ${item.stock}`);
    return true;
}

/** Get current stock for a product */
export function getStock(product: string): number {
    const item = inventory.find(
        (i) => i.product.toLowerCase() === product.toLowerCase()
    );
    return item?.stock ?? 0;
}

/** Get price per bag for a product */
export function getPrice(product: string): number {
    const item = inventory.find(
        (i) => i.product.toLowerCase() === product.toLowerCase()
    );
    return item?.pricePerBag ?? 0;
}

/** Get all inventory items */
export function getAllInventory(): InventoryItem[] {
    return [...inventory];
}
