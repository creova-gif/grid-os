/**
 * ClickPesa Payment Gateway Integration
 * 
 * Unified API for all Tanzania mobile money wallets:
 * - M-Pesa (Vodacom)
 * - Airtel Money
 * - Tigo Pesa
 * - Halopesa (Halotel)
 * 
 * API Documentation: https://developer.clickpesa.com
 * Transaction Fee: 1% Bill Pay fee per spec
 */

// ClickPesa API Configuration
const CLICKPESA_API_URL = 'https://api.clickpesa.com/v1';

/**
 * Names of server-side env vars that are unset or blank.
 * Returns a clear error, or null when every name is set.
 * Never read these from VITE_ / NEXT_PUBLIC_ (those are client bundles).
 */
export function missingEnv(names: string[]): string | null {
  const missing = names.filter((name) => {
    const value = Deno.env.get(name);
    return value == null || value.trim() === '';
  });
  if (missing.length === 0) return null;
  return `Missing required environment variable(s): ${missing.join(', ')}`;
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  phone: string;
  provider: 'mpesa' | 'airtel' | 'tigo' | 'halopesa';
  reference: string;
  description: string;
  callbackUrl: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  reference?: string;
  status?: 'pending' | 'success' | 'failed';
  message?: string;
  error?: string;
}

/**
 * Initiate a payment request via ClickPesa
 */
export async function initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
  try {
    console.log(`[ClickPesa] Initiating payment: ${request.reference} - ${request.amount} ${request.currency} via ${request.provider}`);

    const missingCredentials = missingEnv([
      'CLICKPESA_API_KEY',
      'CLICKPESA_SECRET_KEY',
      'CLICKPESA_MERCHANT_ID',
    ]);
    if (missingCredentials) {
      console.error(`[ClickPesa] ${missingCredentials}`);
      return {
        success: false,
        error: missingCredentials
      };
    }

    const apiKey = Deno.env.get('CLICKPESA_API_KEY') as string;
    const secretKey = Deno.env.get('CLICKPESA_SECRET_KEY') as string;
    const merchantId = Deno.env.get('CLICKPESA_MERCHANT_ID') as string;

    // Validate phone number format (Tanzania: +255...)
    const phoneRegex = /^(\+255|0)[67]\d{8}$/;
    if (!phoneRegex.test(request.phone)) {
      return {
        success: false,
        error: 'Invalid Tanzania phone number. Must be in format +255XXXXXXXXX or 0XXXXXXXXX'
      };
    }

    // Normalize phone number to international format
    const normalizedPhone = request.phone.startsWith('+255') 
      ? request.phone 
      : '+255' + request.phone.substring(1);

    // Prepare ClickPesa API request
    const payload = {
      merchant_id: merchantId,
      amount: request.amount,
      currency: request.currency,
      phone: normalizedPhone,
      provider: request.provider.toUpperCase(),
      reference: request.reference,
      description: request.description,
      callback_url: request.callbackUrl,
      timestamp: new Date().toISOString()
    };

    // Generate HMAC signature for API authentication
    const signature = await generateSignature(payload, secretKey);

    // Make API request
    const response = await fetch(`${CLICKPESA_API_URL}/payments/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Signature': signature
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') {
      console.log(`[ClickPesa] Payment initiated successfully: ${data.transaction_id}`);
      return {
        success: true,
        transactionId: data.transaction_id,
        reference: data.reference,
        status: 'pending',
        message: data.message || 'Payment request sent to customer phone'
      };
    } else {
      console.error(`[ClickPesa] Payment initiation failed:`, data);
      return {
        success: false,
        error: data.message || 'Failed to initiate payment',
        message: data.error_description
      };
    }
  } catch (error) {
    console.error('[ClickPesa] Payment initiation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Verify webhook signature to ensure request is from ClickPesa
 */
export async function verifyWebhookSignature(
  payload: any,
  receivedSignature: string
): Promise<boolean> {
  try {
    const missingSecret = missingEnv(['CLICKPESA_SECRET_KEY']);
    if (missingSecret) {
      console.error(`[ClickPesa] ${missingSecret}`);
      return false;
    }

    const secretKey = Deno.env.get('CLICKPESA_SECRET_KEY') as string;
    const expectedSignature = await generateSignature(payload, secretKey);
    return expectedSignature === receivedSignature;
  } catch (error) {
    console.error('[ClickPesa] Signature verification error:', error);
    return false;
  }
}

/**
 * Generate HMAC-SHA256 signature for API authentication
 */
async function generateSignature(payload: any, secretKey: string): Promise<string> {
  try {
    // Sort payload keys alphabetically and create signature string
    const sortedKeys = Object.keys(payload).sort();
    const signatureString = sortedKeys
      .map(key => `${key}=${payload[key]}`)
      .join('&');

    // Generate HMAC-SHA256 hash
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(signatureString);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    
    // Convert to hex string
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('[ClickPesa] Signature generation error:', error);
    throw error;
  }
}

/**
 * Check payment status
 */
export async function checkPaymentStatus(transactionId: string): Promise<PaymentResponse> {
  try {
    const missingKey = missingEnv(['CLICKPESA_API_KEY']);
    if (missingKey) {
      return {
        success: false,
        error: missingKey
      };
    }

    const apiKey = Deno.env.get('CLICKPESA_API_KEY') as string;
    const response = await fetch(`${CLICKPESA_API_URL}/payments/${transactionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok) {
      return {
        success: true,
        transactionId: data.transaction_id,
        reference: data.reference,
        status: data.status,
        message: data.message
      };
    } else {
      return {
        success: false,
        error: data.message || 'Failed to check payment status'
      };
    }
  } catch (error) {
    console.error('[ClickPesa] Status check error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get supported mobile money providers
 */
export function getSupportedProviders() {
  return [
    {
      id: 'mpesa',
      name: 'M-Pesa',
      logo: '📱',
      color: '#00D97E',
      operator: 'Vodacom',
      marketShare: '45%'
    },
    {
      id: 'airtel',
      name: 'Airtel Money',
      logo: '📲',
      color: '#E2231A',
      operator: 'Airtel',
      marketShare: '28%'
    },
    {
      id: 'tigo',
      name: 'Tigo Pesa',
      logo: '💳',
      color: '#0066CC',
      operator: 'Tigo',
      marketShare: '22%'
    },
    {
      id: 'halopesa',
      name: 'Halopesa',
      logo: '💰',
      color: '#FF6600',
      operator: 'Halotel',
      marketShare: '5%'
    }
  ];
}

/**
 * Format amount to TZS (Tanzania Shillings)
 */
export function formatTZS(amount: number): string {
  return `TZS ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Calculate ClickPesa transaction fee (1% per spec)
 */
export function calculateFee(amount: number): number {
  return Math.round(amount * 0.01); // 1% fee
}
