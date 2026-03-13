/**
 * In-memory order store for Deepak Fertilisers farmer orders.
 * Stores order details captured during calls.
 * In production, replace with a database (e.g. MongoDB, PostgreSQL).
 */

export interface OrderItem {
    product: string;
    quantity: number;
    price: number;
}

export interface Order {
    orderId: string;
    customerName: string;
    phone: string;
    items: OrderItem[];
    totalAmount: number;
    address: string;
    village?: string;
    taluka?: string;
    pincode?: string;
    paymentStatus: 'pending' | 'paid' | 'failed';
    paymentLink?: string;
    timestamp: number;
}

const orders: Order[] = [];
let orderCounter = 1000;

/** Generate a unique order ID */
function generateOrderId(): string {
    orderCounter++;
    return `DF-${Date.now().toString(36).toUpperCase()}-${orderCounter}`;
}

/** Save a new order and return the generated order ID */
export function saveOrder(orderData: Omit<Order, 'orderId' | 'timestamp'>): Order {
    const order: Order = {
        ...orderData,
        orderId: generateOrderId(),
        timestamp: Date.now(),
    };
    orders.push(order);
    console.log(`[OrderStore] New order saved: ${order.orderId} | Items: ${order.items.length} | Total: ₹${order.totalAmount}`);
    return order;
}

/** Get all orders */
export function getOrders(): Order[] {
    return [...orders];
}

/** Get order by ID */
export function getOrderById(orderId: string): Order | undefined {
    return orders.find((o) => o.orderId === orderId);
}

/** Update payment status */
export function updatePaymentStatus(orderId: string, status: 'pending' | 'paid' | 'failed'): boolean {
    const order = orders.find((o) => o.orderId === orderId);
    if (!order) return false;
    order.paymentStatus = status;
    console.log(`[OrderStore] Payment status updated: ${orderId} → ${status}`);
    return true;
}

/** Add item to existing order */
export function addItemToOrder(orderId: string, item: OrderItem): Order | null {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return null;

    order.items.push(item);
    order.totalAmount += (item.price * item.quantity);
    console.log(`[OrderStore] Item added to ${orderId}: ${item.product} x${item.quantity}`);
    return order;
}
