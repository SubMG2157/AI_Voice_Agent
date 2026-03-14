/**
 * SMS Service — Send order confirmation + payment link via Plivo.
 * Template includes: name, phone, address, order details, payment link, 24hr deadline.
 */

function normalizePhoneForPlivo(input: string): string {
    const value = String(input || '').trim().replace(/\s+/g, '');
    if (!value) return value;
    if (value.startsWith('+')) return value;
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length >= 12) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return `+${digits}`;
}

function getPlivoConfig() {
    return {
        authId: process.env.PLIVO_AUTH_ID ?? '',
        authToken: process.env.PLIVO_AUTH_TOKEN ?? '',
        src: normalizePhoneForPlivo(process.env.PLIVO_NUMBER ?? ''),
        dltEntityId: process.env.DLT_ENTITY_ID ?? '',
        dltTemplateId: process.env.DLT_TEMPLATE_ID ?? '',
        callbackUrl: process.env.BACKEND_BASE_URL ? `${process.env.BACKEND_BASE_URL}/plivo/sms-status` : '',
    };
}

function getPlivoAuthHeader(authId: string, authToken: string): string {
    return `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`;
}

export interface OrderItem {
    product: string;
    quantity: number;
    price: number;
}

export interface OrderSmsPayload {
    customerName: string;
    phone: string;
    address: string;
    village?: string;
    taluka?: string;
    pinCode?: string;
    items: OrderItem[];
    totalAmount: number;
    orderId: string;
}

/**
 * Generate a placeholder payment link (replace with real gateway in production).
 */
export function generatePaymentLink(orderId: string): string {
    return 'https://amrutpeth.com/product/mahadhan-smartek-102626';
}

/**
 * Build the SMS body with all required fields:
 * Name, Phone, Address, Order details, Payment link, 24-hour deadline.
 */
import { sendOrderSmsTwilio } from './twilioSmsService.ts';

export function formatSmsBody(payload: OrderSmsPayload): string {
    const paymentLink = generatePaymentLink(payload.orderId);
    // Build address from clean structured fields — never use raw spoken text
    const addressParts = [payload.village, payload.taluka, payload.pinCode].filter(Boolean);
    const fullAddress = addressParts.length > 0
        ? addressParts.join(', ')
        : payload.address || 'पत्ता उपलब्ध नाही';

    let itemsText = "";
    payload.items.forEach(item => {
        const lineTotal = item.price * item.quantity;
        itemsText += `
${item.product} – ${item.quantity} पिशव्या
दर: ₹${item.price} प्रति पिशवी
उपएकूण: ₹${lineTotal}
`;
    });

    return `नमस्कार ${payload.customerName}जी,

आपला ऑर्डर तपशील:

नाव: ${payload.customerName}
मोबाईल: ${payload.phone}
पत्ता: ${fullAddress}

उत्पादन तपशील:
${itemsText}

एकूण रक्कम: ₹${payload.totalAmount} (किंमत GST सहित)

ऑर्डर क्र.: ${payload.orderId}

पेमेंट लिंक:
${paymentLink}

कृपया 24 तासांच्या आत पेमेंट करा.
पेमेंट झाल्यानंतर 3-4 दिवसांत डिलिव्हरी होईल.

धन्यवाद – दीपक फर्टिलायझर्स 🌾`;
}

/**
 * Send order confirmation SMS to farmer.
 */
export async function sendOrderSms(payload: OrderSmsPayload): Promise<{ success: boolean; sid?: string; error?: string }> {
    // Use Twilio for SMS, Plivo handles calls separately
    return sendOrderSmsTwilio(payload);
}
