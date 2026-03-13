export interface ProductItem {
    name: string;
    price: number;
    alias?: string[];
}

export const productCatalog: ProductItem[] = [
    { name: "NPK 19-19-19", price: 1200, alias: ["19:19:19", "१९:१९:१९", "Start"] },
    { name: "NPK 12-61-00", price: 1450, alias: ["12:61:00", "१२:६१:००", "MAP"] },
    { name: "NPK 00-52-34", price: 1800, alias: ["00:52:34", "००:५२:३४", "MKP"] },
    { name: "NPK 13-00-45", price: 1350, alias: ["13:00:45", "१३:००:४५", "KNO3"] },
    { name: "NPK 00-00-50", price: 1900, alias: ["00:00:50", "००:००:५०", "SOP"] },
    { name: "Mahadhan Amruta", price: 1250, alias: ["अमृता", "Amruta"] },
    { name: "Mahadhan Bensulf", price: 750, alias: ["बेंसल्फ", "Bensulf"] },
    { name: "Mahadhan Chakri", price: 1100, alias: ["चक्री", "Chakri"] },
    { name: "Mahadhan Smartek", price: 1250, alias: ["समारटेक", "Smartek", "Smart Tech", "Mahadhan Smart Tech", "महाधन स्मार्ट टेक", "Nitrogen Booster", "Mahadhan Nitrogen Booster"] },
    { name: "Mahadhan Zincsulf", price: 750, alias: ["झिंकसल्फ", "Zincsulf", "Zinc Sulphate", "महाधन झिंकसल्फ", "झिंक सल्फ", "महाधन जस्त"] }
];

export function findProduct(inputName: string): ProductItem | undefined {
    const normalizedInput = inputName.trim().toLowerCase().replace(/\s+/g, '');

    return productCatalog.find(p => {
        // 1. Check main name
        const pName = p.name.toLowerCase().replace(/\s+/g, '');
        if (pName === normalizedInput || pName.includes(normalizedInput) || normalizedInput.includes(pName)) return true;

        // 2. Check aliases
        return p.alias?.some(a => {
            const alias = a.toLowerCase().replace(/\s+/g, '');
            return alias === normalizedInput || alias.includes(normalizedInput) || normalizedInput.includes(alias);
        });
    });
}

export function getProductPrice(productName: string): number {
    const product = findProduct(productName);
    return product ? product.price : 0;
}
