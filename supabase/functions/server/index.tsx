import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { seedCustomers } from "./seed-customers.tsx";
import * as clickpesa from "./clickpesa.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-4719aee2/health", (c) => {
  return c.json({ status: "ok" });
});

// Seed customers endpoint (for initial setup)
app.post("/make-server-4719aee2/seed-customers", async (c) => {
  try {
    await seedCustomers();
    return c.json({ success: true, message: "Customers seeded successfully" });
  } catch (error) {
    console.error("Error seeding customers:", error);
    return c.json({ error: "Failed to seed customers" }, 500);
  }
});

// ========== AGENT APP API ROUTES ==========

// Lookup customer by phone number
app.post("/make-server-4719aee2/agent/customer/lookup", async (c) => {
  try {
    const { phone } = await c.req.json();
    
    if (!phone) {
      return c.json({ error: "Phone number is required" }, 400);
    }

    // Get all customers from KV store
    const customers = await kv.getByPrefix("customer:");
    
    // Find customer by phone
    const customer = customers.find((c: any) => c.phone === phone);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }

    return c.json({ customer });
  } catch (error) {
    console.error("Error looking up customer:", error);
    return c.json({ error: "Failed to lookup customer" }, 500);
  }
});

// Get all customers (with optional search)
app.get("/make-server-4719aee2/agent/customers", async (c) => {
  try {
    const search = c.req.query("search") || "";
    
    // Get all customers from KV store
    let customers = await kv.getByPrefix("customer:");
    
    // Filter by search query if provided
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter((customer: any) => 
        customer.name.toLowerCase().includes(searchLower) ||
        customer.phone.includes(search) ||
        customer.meterId.toLowerCase().includes(searchLower)
      );
    }

    return c.json({ customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return c.json({ error: "Failed to fetch customers" }, 500);
  }
});

// Process payment
app.post("/make-server-4719aee2/agent/payment", async (c) => {
  try {
    const { customerId, amount, paymentMethod } = await c.req.json();
    
    if (!customerId || !amount || !paymentMethod) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Get customer data
    const customer = await kv.get(`customer:${customerId}`);
    
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }

    // Calculate kWh from payment amount (example: 400 TZS per kWh)
    const kwhPurchased = amount / 400;
    
    // Generate 20-digit STS token (mock implementation)
    const stsToken = generateSTSToken();
    
    // Update customer balance
    const newBalance = (customer.balance || 0) + amount;
    await kv.set(`customer:${customerId}`, {
      ...customer,
      balance: newBalance,
      lastPayment: new Date().toISOString(),
      lastPaymentAmount: amount
    });

    // Log transaction
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await kv.set(`transaction:${transactionId}`, {
      id: transactionId,
      customerId,
      customerName: customer.name,
      meterId: customer.meterId,
      amount,
      paymentMethod,
      kwhPurchased,
      stsToken,
      timestamp: new Date().toISOString(),
      agentId: "agent-001" // In production, this would come from auth
    });

    return c.json({
      success: true,
      transaction: {
        id: transactionId,
        stsToken,
        kwhPurchased: kwhPurchased.toFixed(2),
        newBalance
      }
    });
  } catch (error) {
    console.error("Error processing payment:", error);
    return c.json({ error: "Failed to process payment" }, 500);
  }
});

// Report issue
app.post("/make-server-4719aee2/agent/issue", async (c) => {
  try {
    const { customerId, meterId, issueType, description } = await c.req.json();
    
    if (!meterId || !issueType) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const issueId = `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await kv.set(`issue:${issueId}`, {
      id: issueId,
      customerId,
      meterId,
      issueType,
      description,
      status: "open",
      timestamp: new Date().toISOString(),
      agentId: "agent-001" // In production, this would come from auth
    });

    return c.json({
      success: true,
      issueId
    });
  } catch (error) {
    console.error("Error reporting issue:", error);
    return c.json({ error: "Failed to report issue" }, 500);
  }
});

// Submit meter inspection with photo
app.post("/make-server-4719aee2/agent/inspection", async (c) => {
  try {
    const { 
      meterId, 
      customerId, 
      customerName,
      issueType, 
      severity,
      notes, 
      photo, 
      gpsLocation,
      meterReading 
    } = await c.req.json();
    
    if (!meterId || !issueType) {
      return c.json({ error: "Missing required fields: meterId and issueType" }, 400);
    }

    const inspectionId = `inspection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const inspection = {
      id: inspectionId,
      meterId,
      customerId,
      customerName,
      issueType,
      severity: severity || 'medium',
      notes: notes || '',
      photo: photo || null, // Base64 encoded photo data
      gpsLocation: gpsLocation || null,
      meterReading: meterReading || null,
      status: "pending",
      timestamp: new Date().toISOString(),
      agentId: "agent-001", // In production, this would come from auth
      syncedAt: new Date().toISOString()
    };

    await kv.set(`inspection:${inspectionId}`, inspection);

    // Also create an alert for critical inspections
    if (severity === 'critical' || severity === 'high') {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await kv.set(`alert:${alertId}`, {
        id: alertId,
        type: 'inspection',
        severity,
        meterId,
        message: `${issueType} reported by agent`,
        description: notes,
        timestamp: new Date().toISOString(),
        status: 'open'
      });
    }

    return c.json({
      success: true,
      inspectionId,
      inspection
    });
  } catch (error) {
    console.error("Error submitting inspection:", error);
    return c.json({ error: "Failed to submit inspection" }, 500);
  }
});

// Get pending inspections for sync
app.get("/make-server-4719aee2/agent/inspections/pending", async (c) => {
  try {
    const agentId = c.req.query("agentId") || "agent-001";
    
    // Get all inspections
    const allInspections = await kv.getByPrefix("inspection:");
    
    // Filter pending inspections for this agent
    const pendingInspections = allInspections.filter((insp: any) => 
      insp.agentId === agentId && insp.status === "pending"
    );

    return c.json({ 
      inspections: pendingInspections,
      count: pendingInspections.length
    });
  } catch (error) {
    console.error("Error fetching pending inspections:", error);
    return c.json({ error: "Failed to fetch pending inspections" }, 500);
  }
});

// Sync endpoint - upload pending data and download updates
app.post("/make-server-4719aee2/agent/sync", async (c) => {
  try {
    const { 
      pendingTransactions = [], 
      pendingInspections = [],
      lastSyncTime,
      agentId = "agent-001"
    } = await c.req.json();

    const syncResults = {
      uploaded: {
        transactions: 0,
        inspections: 0
      },
      downloaded: {
        customers: [],
        updates: []
      },
      conflicts: [],
      timestamp: new Date().toISOString()
    };

    // Upload pending transactions
    for (const txn of pendingTransactions) {
      try {
        const txnId = txn.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await kv.set(`transaction:${txnId}`, {
          ...txn,
          syncedAt: new Date().toISOString()
        });
        syncResults.uploaded.transactions++;
        
        // Update customer balance
        if (txn.customerId && txn.amount) {
          const customer = await kv.get(`customer:${txn.customerId}`);
          if (customer) {
            await kv.set(`customer:${txn.customerId}`, {
              ...customer,
              balance: (customer.balance || 0) + txn.amount,
              lastPayment: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.error(`Failed to upload transaction ${txn.id}:`, error);
        syncResults.conflicts.push({
          type: 'transaction',
          id: txn.id,
          error: 'Upload failed'
        });
      }
    }

    // Upload pending inspections
    for (const insp of pendingInspections) {
      try {
        const inspId = insp.id || `inspection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await kv.set(`inspection:${inspId}`, {
          ...insp,
          syncedAt: new Date().toISOString()
        });
        syncResults.uploaded.inspections++;
      } catch (error) {
        console.error(`Failed to upload inspection ${insp.id}:`, error);
        syncResults.conflicts.push({
          type: 'inspection',
          id: insp.id,
          error: 'Upload failed'
        });
      }
    }

    // Download updated customer data (customers modified since lastSyncTime)
    const allCustomers = await kv.getByPrefix("customer:");
    const updatedCustomers = lastSyncTime 
      ? allCustomers.filter((c: any) => 
          new Date(c.lastPayment || c.createdAt || 0) > new Date(lastSyncTime)
        )
      : allCustomers;

    syncResults.downloaded.customers = updatedCustomers;

    // Download system updates/notifications
    const updates = await kv.getByPrefix("update:");
    syncResults.downloaded.updates = updates.filter((u: any) => 
      !lastSyncTime || new Date(u.timestamp) > new Date(lastSyncTime)
    );

    // Log sync event
    const syncLogId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await kv.set(`synclog:${syncLogId}`, {
      id: syncLogId,
      agentId,
      timestamp: new Date().toISOString(),
      uploaded: syncResults.uploaded,
      downloaded: {
        customers: syncResults.downloaded.customers.length,
        updates: syncResults.downloaded.updates.length
      },
      conflicts: syncResults.conflicts.length
    });

    return c.json({
      success: true,
      results: syncResults
    });
  } catch (error) {
    console.error("Error during sync:", error);
    return c.json({ error: "Failed to sync data" }, 500);
  }
});

// Get sync status
app.get("/make-server-4719aee2/agent/sync/status", async (c) => {
  try {
    const agentId = c.req.query("agentId") || "agent-001";
    
    // Get last sync log for this agent
    const syncLogs = await kv.getByPrefix("synclog:");
    const agentLogs = syncLogs
      .filter((log: any) => log.agentId === agentId)
      .sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    const lastSync = agentLogs[0];
    
    // Get pending counts
    const allTransactions = await kv.getByPrefix("transaction:");
    const allInspections = await kv.getByPrefix("inspection:");
    
    const pendingTransactions = allTransactions.filter((t: any) => 
      t.agentId === agentId && !t.syncedAt
    );
    
    const pendingInspections = allInspections.filter((i: any) => 
      i.agentId === agentId && !i.syncedAt
    );

    return c.json({
      lastSync: lastSync ? {
        timestamp: lastSync.timestamp,
        uploaded: lastSync.uploaded,
        downloaded: lastSync.downloaded,
        conflicts: lastSync.conflicts
      } : null,
      pending: {
        transactions: pendingTransactions.length,
        inspections: pendingInspections.length
      },
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting sync status:", error);
    return c.json({ error: "Failed to get sync status" }, 500);
  }
});

// ========== CLICKPESA PAYMENT GATEWAY ROUTES ==========

// Initiate mobile money payment via ClickPesa
app.post("/make-server-4719aee2/payments/clickpesa/initiate", async (c) => {
  try {
    const { customerId, amount, provider, phone } = await c.req.json();
    
    if (!customerId || !amount || !provider || !phone) {
      return c.json({ error: "Missing required fields: customerId, amount, provider, phone" }, 400);
    }

    // Validate provider
    const validProviders = ['mpesa', 'airtel', 'tigo', 'halopesa'];
    if (!validProviders.includes(provider.toLowerCase())) {
      return c.json({ 
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` 
      }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl || supabaseUrl.trim() === '') {
      console.error('[Payment] Missing required environment variable: SUPABASE_URL');
      return c.json({ error: 'Missing required environment variable: SUPABASE_URL' }, 500);
    }

    // Get customer data
    const customer = await kv.get(`customer:${customerId}`);
    if (!customer) {
      return c.json({ error: "Customer not found" }, 404);
    }

    // Generate unique reference
    const reference = `GRIDOS-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Calculate fee (1% per spec)
    const fee = clickpesa.calculateFee(amount);
    const totalAmount = amount + fee;

    // Prepare payment request
    const paymentRequest: clickpesa.PaymentRequest = {
      amount: totalAmount,
      currency: 'TZS',
      phone: phone,
      provider: provider.toLowerCase() as any,
      reference: reference,
      description: `GridOS Token Purchase - ${customer.name} (${customer.meterId})`,
      callbackUrl: `${supabaseUrl}/functions/v1/make-server-4719aee2/webhooks/clickpesa/callback`
    };

    console.log(`[Payment] Initiating ClickPesa payment for customer ${customerId}: ${clickpesa.formatTZS(totalAmount)} via ${provider}`);

    // Initiate payment through ClickPesa
    const result = await clickpesa.initiatePayment(paymentRequest);

    if (result.success) {
      // Store pending payment record
      const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await kv.set(`payment:${paymentId}`, {
        id: paymentId,
        customerId,
        customerName: customer.name,
        meterId: customer.meterId,
        amount,
        fee,
        totalAmount,
        provider,
        phone,
        reference,
        clickpesaTransactionId: result.transactionId,
        status: 'pending',
        initiatedAt: new Date().toISOString()
      });

      return c.json({
        success: true,
        paymentId,
        reference,
        transactionId: result.transactionId,
        amount,
        fee,
        totalAmount,
        provider,
        status: 'pending',
        message: result.message || 'Payment request sent. Please complete on your phone.'
      });
    } else {
      console.error(`[Payment] ClickPesa payment initiation failed:`, result.error);
      return c.json({
        success: false,
        error: result.error || 'Failed to initiate payment',
        message: result.message
      }, 400);
    }
  } catch (error) {
    console.error("[Payment] Error initiating ClickPesa payment:", error);
    return c.json({ error: "Failed to initiate payment" }, 500);
  }
});

// ClickPesa webhook callback
app.post("/make-server-4719aee2/webhooks/clickpesa/callback", async (c) => {
  try {
    const body = await c.req.json();
    const signature = c.req.header('X-Signature') || '';

    console.log('[ClickPesa Webhook] Received callback:', {
      reference: body.reference,
      status: body.status,
      amount: body.amount
    });

    const missingSecret = clickpesa.missingEnv(['CLICKPESA_SECRET_KEY']);
    if (missingSecret) {
      console.error(`[ClickPesa Webhook] ${missingSecret}`);
      return c.json({ error: missingSecret }, 500);
    }

    // Verify webhook signature
    const isValid = await clickpesa.verifyWebhookSignature(body, signature);
    if (!isValid) {
      console.error('[ClickPesa Webhook] Invalid signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Find payment record
    const allPayments = await kv.getByPrefix("payment:");
    const payment = allPayments.find((p: any) => 
      p.reference === body.reference || 
      p.clickpesaTransactionId === body.transaction_id
    );

    if (!payment) {
      console.error(`[ClickPesa Webhook] Payment not found for reference: ${body.reference}`);
      return c.json({ error: 'Payment not found' }, 404);
    }

    // Update payment status
    const updatedPayment = {
      ...payment,
      status: body.status,
      clickpesaResponse: body,
      completedAt: new Date().toISOString()
    };

    await kv.set(`payment:${payment.id}`, updatedPayment);

    // If payment successful, credit customer and generate STS token
    if (body.status === 'success' || body.status === 'completed') {
      console.log(`[ClickPesa Webhook] Payment successful for ${payment.customerName}: ${clickpesa.formatTZS(payment.amount)}`);

      // Calculate kWh (400 TZS per kWh per spec)
      const kwhPurchased = payment.amount / 400;
      
      // Generate STS token
      const stsToken = generateSTSToken();

      // Update customer balance
      const customer = await kv.get(`customer:${payment.customerId}`);
      if (customer) {
        const newBalance = (customer.balance || 0) + payment.amount;
        await kv.set(`customer:${payment.customerId}`, {
          ...customer,
          balance: newBalance,
          lastPayment: new Date().toISOString(),
          lastPaymentAmount: payment.amount
        });

        // Create transaction record
        const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await kv.set(`transaction:${transactionId}`, {
          id: transactionId,
          customerId: payment.customerId,
          customerName: payment.customerName,
          meterId: payment.meterId,
          amount: payment.amount,
          paymentMethod: payment.provider,
          kwhPurchased,
          stsToken,
          reference: payment.reference,
          clickpesaTransactionId: payment.clickpesaTransactionId,
          timestamp: new Date().toISOString()
        });

        console.log(`[ClickPesa Webhook] STS token generated for ${payment.customerName}: ${stsToken}`);

        // TODO: Send SMS with STS token via Africa's Talking
        // await sendSMS(payment.phone, `Your GridOS token: ${stsToken}. Valid for ${kwhPurchased.toFixed(2)} kWh.`);
      }
    } else if (body.status === 'failed' || body.status === 'cancelled') {
      console.log(`[ClickPesa Webhook] Payment ${body.status} for reference: ${body.reference}`);
    }

    return c.json({ 
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('[ClickPesa Webhook] Error processing callback:', error);
    return c.json({ error: 'Failed to process webhook' }, 500);
  }
});

// Check payment status
app.get("/make-server-4719aee2/payments/clickpesa/status/:paymentId", async (c) => {
  try {
    const paymentId = c.req.param('paymentId');
    
    const payment = await kv.get(`payment:${paymentId}`);
    
    if (!payment) {
      return c.json({ error: "Payment not found" }, 404);
    }

    // Optionally check with ClickPesa API for latest status
    if (payment.clickpesaTransactionId && payment.status === 'pending') {
      const statusResult = await clickpesa.checkPaymentStatus(payment.clickpesaTransactionId);
      if (statusResult.success && statusResult.status !== payment.status) {
        // Update local status
        payment.status = statusResult.status;
        await kv.set(`payment:${paymentId}`, payment);
      }
    }

    return c.json({
      success: true,
      payment: {
        id: payment.id,
        reference: payment.reference,
        amount: payment.amount,
        fee: payment.fee,
        totalAmount: payment.totalAmount,
        provider: payment.provider,
        status: payment.status,
        initiatedAt: payment.initiatedAt,
        completedAt: payment.completedAt
      }
    });
  } catch (error) {
    console.error("Error checking payment status:", error);
    return c.json({ error: "Failed to check payment status" }, 500);
  }
});

// Get supported providers
app.get("/make-server-4719aee2/payments/providers", (c) => {
  const providers = clickpesa.getSupportedProviders();
  return c.json({
    success: true,
    providers
  });
});

// Helper function to generate STS token (mock)
function generateSTSToken(): string {
  // In production, this would use the actual STS token generation algorithm
  // For now, generate a 20-digit number in the format: XXXX-XXXX-XXXX-XXXX-XXXX
  let token = '';
  for (let i = 0; i < 5; i++) {
    const segment = Math.floor(1000 + Math.random() * 9000).toString();
    token += (i > 0 ? '-' : '') + segment;
  }
  return token;
}

Deno.serve(app.fetch);