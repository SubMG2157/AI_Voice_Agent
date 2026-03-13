/**
 * Call State Machine — Tracks conversation stage per call.
 * Updated with DISEASE, CALLBACK stages for dynamic mid-call routing.
 */

export enum CallStage {
    GREETING = 'GREETING',
    IDENTITY_CHECK = 'IDENTITY_CHECK',
    CONSENT = 'CONSENT',
    FEEDBACK = 'FEEDBACK',
    UPSELL = 'UPSELL',
    DISEASE_CHECK = 'DISEASE_CHECK',
    DISEASE_CONSULT = 'DISEASE_CONSULT',
    ORDER_PRODUCT = 'ORDER_PRODUCT',
    ORDER_QUANTITY = 'ORDER_QUANTITY',
    ORDER_ADDRESS = 'ORDER_ADDRESS',
    ORDER_CONFIRM = 'ORDER_CONFIRM',
    PAYMENT = 'PAYMENT',
    CALLBACK_DAY = 'CALLBACK_DAY',
    CALLBACK_TIME = 'CALLBACK_TIME',
    NEGATIVE_NOTE = 'NEGATIVE_NOTE',
    CLOSED = 'CLOSED',
}

interface CallState {
    stage: CallStage;
    farmerName: string;
    lastProduct: string;
    feedback?: 'positive' | 'negative';
    orderProduct?: string;
    orderQuantity?: number;
    orderAddress?: string;
    orderVillage?: string;
    orderTaluka?: string;
    orderPinCode?: string;
    diseaseNotes?: string;
    callbackDay?: string;
    callbackTime?: string;
    issueNotes?: string;
}

const callStates = new Map<string, CallState>();

export function initCallState(callSid: string, farmerName: string, lastProduct: string): void {
    callStates.set(callSid, {
        stage: CallStage.GREETING,
        farmerName,
        lastProduct,
    });
}

export function getCallState(callSid: string): CallState | undefined {
    return callStates.get(callSid);
}

export function getCallStage(callSid: string): CallStage {
    return callStates.get(callSid)?.stage ?? CallStage.GREETING;
}

export function updateStage(callSid: string, stage: CallStage): void {
    const state = callStates.get(callSid);
    if (state) {
        state.stage = stage;
        console.log(`[CallState] ${callSid} → ${stage}`);
    }
}

export function updateCallState(callSid: string, updates: Partial<CallState>): void {
    const state = callStates.get(callSid);
    if (state) {
        Object.assign(state, updates);
    }
}

export function deleteCallState(callSid: string): void {
    callStates.delete(callSid);
}
