import { OrderSmsPayload } from './smsService.js';

export function generatePaymentLink(orderId: string): string {
  return 'https://amrutpeth.com/product/mahadhan-smartek-102626';
}

export function formatSmsBody(payload: OrderSmsPayload): string {
  const paymentLink = generatePaymentLink(payload.orderId);
  const addressParts = [payload.village, payload.taluka, payload.pinCode].filter(Boolean);
  const fullAddress = addressParts.length > 0
    ? addressParts.join(', ')
    : payload.address || 'पत्ता उपलब्ध नाही';

  let itemsText = '';
  payload.items.forEach((item, i) => {
    const lineTotal = item.price * item.quantity;
    itemsText += `${i + 1}. ${item.product}\n   ${item.quantity} पिशव्या × ₹${item.price} = ₹${lineTotal}\n`;
  });

  const totalQty = payload.items.reduce((s, i) => s + i.quantity, 0);

  return `नमस्कार ${payload.customerName}जी,

📦 ऑर्डर तपशील — ${payload.orderId}

${itemsText}
━━━━━━━━━━━━━━━━━━
एकूण पिशव्या: ${totalQty}
एकूण रक्कम: ₹${payload.totalAmount}
━━━━━━━━━━━━━━━━━━

📍 डिलिव्हरी पत्ता:
${fullAddress}

📱 मोबाईल: ${payload.phone}

💳 पेमेंट लिंक:
${paymentLink}

⏰ 24 तासांत पेमेंट करा.
🚚 3-4 दिवसांत डिलिव्हरी.

धन्यवाद – दीपक फर्टिलायझर्स`;
}
