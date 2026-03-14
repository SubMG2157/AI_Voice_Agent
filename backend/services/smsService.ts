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

import { sendOrderSmsTwilio } from './twilioSmsService.js';

/**
 * Send order confirmation SMS to farmer.
 */
export async function sendOrderSms(payload: OrderSmsPayload): Promise<{ success: boolean; sid?: string; error?: string }> {
    // Use Twilio for SMS, Plivo handles calls separately
    return sendOrderSmsTwilio(payload);
}
