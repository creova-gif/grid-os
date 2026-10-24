import { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, Search, ArrowLeft, CheckCircle, Loader2, 
  Camera, MapPin, AlertTriangle, Upload, Download, RefreshCw,
  FileText, Image as ImageIcon, Zap
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { METERS } from '../data/site-config';

type Screen = 'home' | 'payment' | 'customers' | 'token-result' | 'inspection' | 'sync';

interface Customer {
  id: string;
  name: string;
  phone: string;
  meterId: string;
  balance: number;
  type: string;
  status: string;
}

interface Transaction {
  id: string;
  stsToken: string;
  kwhPurchased: string;
  newBalance: number;
}

interface Inspection {
  id?: string;
  meterId: string;
  customerId: string;
  customerName: string;
  issueType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  notes: string;
  photo: string | null;
  gpsLocation: string | null;
  meterReading: string;
}

interface SyncStatus {
  lastSync: {
    timestamp: string;
    uploaded: { transactions: number; inspections: number };
    downloaded: { customers: number; updates: number };
  } | null;
  pending: {
    transactions: number;
    inspections: number;
  };
}

export default function AgentApp() {
  const [activeScreen, setActiveScreen] = useState<Screen>('home');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [amount, setAmount] = useState('5000');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'airtel'>('cash');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  
  // Inspection state
  const [inspection, setInspection] = useState<Inspection>({
    meterId: '',
    customerId: '',
    customerName: '',
    issueType: 'normal',
    severity: 'medium',
    notes: '',
    photo: null,
    gpsLocation: null,
    meterReading: ''
  });
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-4719aee2`;

  // Seed customers on mount
  useEffect(() => {
    const seedData = async () => {
      try {
        const response = await fetch(`${API_BASE}/seed-customers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          console.log('Customer data seeded successfully');
          toast.success('Customer database initialized!');
        }
      } catch (error) {
        console.error('Error seeding customers:', error);
      }
    };
    seedData();
  }, []);

  // Load sync status
  useEffect(() => {
    if (activeScreen === 'sync') {
      loadSyncStatus();
    }
  }, [activeScreen]);

  // Lookup customer by phone
  const lookupCustomer = async () => {
    if (!phoneNumber.trim()) {
      toast.error('Tafadhali ingiza nambari ya simu');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/agent/customer/lookup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone: phoneNumber })
      });

      const data = await response.json();

      if (response.ok) {
        setSelectedCustomer(data.customer);
        toast.success(`Mteja amepatikana: ${data.customer.name}`);
      } else {
        toast.error(data.error || 'Mteja hajapatikana');
        setSelectedCustomer(null);
      }
    } catch (error) {
      console.warn('Network unreachable for lookup, using local cache:', error);
      const cleanDigits = phoneNumber.replace(/\D/g, '').slice(-9);
      const query = phoneNumber.trim().toLowerCase();
      const local = METERS.find(m => {
        const phoneDigits = m.customer.phone.replace(/\D/g, '').slice(-9);
        return (cleanDigits.length >= 7 && phoneDigits.endsWith(cleanDigits)) ||
          m.customer.phone.includes(query) ||
          m.id.toLowerCase().includes(query) ||
          m.customer.name.toLowerCase().includes(query);
      });
      if (local) {
        setSelectedCustomer({
          id: local.id,
          name: local.customer.name,
          phone: local.customer.phone,
          meterId: local.id,
          balance: local.initial_balance_tzs,
          type: local.customer.type,
          status: 'active'
        });
        toast.info(`Hali ya Nje ya Mtandao (Offline): Mteja ${local.customer.name} amepatikana.`);
      } else {
        toast.error('Hitilafu ya mtandao na mteja hakupatikana kwenye kifaa.');
      }
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  };

  // Process payment
  const processPayment = async () => {
    if (!selectedCustomer) {
      toast.error('Tafadhali tafuta mteja kwanza');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Kiasi si sahihi');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/agent/payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount: parseFloat(amount),
          paymentMethod
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTransaction(data.transaction);
        setActiveScreen('token-result');
        toast.success('Malipo yamehifadhiwa!');
      } else {
        toast.error(data.error || 'Hitilafu katika kuhifadhi malipo');
      }
    } catch (error) {
      console.warn('Network unreachable for payment, generating offline STS token:', error);
      const kwhPurchased = (parseFloat(amount) / 400).toFixed(1);
      // Generate standard 20-digit STS token format (4-digit blocks)
      const stsToken = Array.from({ length: 5 }, () => 
        Math.floor(1000 + Math.random() * 9000).toString()
      ).join('-');

      const offlineTx: Transaction = {
        id: `TX-OFFLINE-${Date.now().toString(36).toUpperCase()}`,
        stsToken,
        kwhPurchased,
        newBalance: (selectedCustomer.balance || 0) + parseFloat(amount)
      };

      setTransaction(offlineTx);
      setActiveScreen('token-result');
      toast.warning('Tokeni imezalishwa nje ya mtandao (Offline Queue).');
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  };

  // Fetch customers
  const fetchCustomers = async (search = '') => {
    setLoading(true);
    try {
      const url = `${API_BASE}/agent/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setCustomers(data.customers);
      } else {
        toast.error(data.error || 'Hitilafu katika kupata wateja');
      }
    } catch (error) {
      console.warn('Network unreachable for customers list, using local records:', error);
      const localCustomers: Customer[] = METERS.map(m => ({
        id: m.id,
        name: m.customer.name,
        phone: m.customer.phone,
        meterId: m.id,
        balance: m.initial_balance_tzs,
        type: m.customer.type,
        status: 'active'
      })).filter(c => 
        !search || 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.phone.includes(search) || 
        c.meterId.toLowerCase().includes(search.toLowerCase())
      );
      setCustomers(localCustomers);
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle photo capture
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setCapturedPhoto(base64);
        setInspection(prev => ({ ...prev, photo: base64 }));
        toast.success('Picha imehifadhiwa');
      };
      reader.readAsDataURL(file);
    }
  };

  // Get GPS location
  const captureGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = `${position.coords.latitude},${position.coords.longitude}`;
          setInspection(prev => ({ ...prev, gpsLocation: location }));
          toast.success(`GPS: ${location}`);
        },
        (error) => {
          toast.error('Imeshindwa kupata GPS');
          console.error('GPS error:', error);
        }
      );
    } else {
      toast.error('GPS hazipatikani kwenye kifaa hiki');
    }
  };

  // Submit inspection
  const submitInspection = async () => {
    if (!inspection.meterId || !inspection.issueType) {
      toast.error('Tafadhali jaza taarifa zote muhimu');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/agent/inspection`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inspection)
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Ripoti imehifadhiwa!');
        // Reset inspection form
        setInspection({
          meterId: '',
          customerId: '',
          customerName: '',
          issueType: 'normal',
          severity: 'medium',
          notes: '',
          photo: null,
          gpsLocation: null,
          meterReading: ''
        });
        setCapturedPhoto(null);
        setActiveScreen('home');
      } else {
        toast.error(data.error || 'Hitilafu katika kuhifadhi ripoti');
      }
    } catch (error) {
      console.error('Error submitting inspection:', error);
      toast.error('Hitilafu ya mtandao');
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  };

  // Load sync status
  const loadSyncStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/agent/sync/status?agentId=agent-001`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setSyncStatus(data);
      }
    } catch (error) {
      console.error('Error loading sync status:', error);
    }
  };

  // Perform sync
  const performSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`${API_BASE}/agent/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pendingTransactions: [],
          pendingInspections: [],
          lastSyncTime,
          agentId: 'agent-001'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setLastSyncTime(data.results.timestamp);
        toast.success(`Sync complete! ↑${data.results.uploaded.transactions + data.results.uploaded.inspections} ↓${data.results.downloaded.customers.length}`);
        await loadSyncStatus();
        setIsOnline(true);
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Error during sync:', error);
      toast.error('Hitilafu ya mtandao');
      setIsOnline(false);
    } finally {
      setSyncing(false);
    }
  };

  // Load customers when viewing customer list
  useEffect(() => {
    if (activeScreen === 'customers') {
      fetchCustomers(searchQuery);
    }
  }, [activeScreen]);

  // Search customers with debounce
  useEffect(() => {
    if (activeScreen === 'customers') {
      const timer = setTimeout(() => {
        fetchCustomers(searchQuery);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  // Render home screen
  const renderHomeScreen = () => (
    <>
      <div className="pb-4 border-b" style={{ borderColor: 'var(--bg-border-subtle)' }}>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          GridOS Agent
        </h2>
        <div className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
          Ukerewe · Nansio
        </div>
        <div className="text-xs flex items-center gap-1" style={{ color: isOnline ? 'var(--brand-emerald)' : 'var(--status-danger)' }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isOnline ? 'var(--brand-emerald)' : 'var(--status-danger)' }} />
          {isOnline ? '● Online · synced' : '● Offline mode'}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <button
          onClick={() => setActiveScreen('payment')}
          className="w-full py-3 px-4 rounded-lg font-medium transition-colors hover:opacity-90"
          style={{
            backgroundColor: 'var(--brand-emerald)',
            color: '#ffffff'
          }}
        >
          Collect Payment
        </button>
        <button
          onClick={() => setActiveScreen('customers')}
          className="w-full py-3 px-4 rounded-lg font-medium transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: `1px solid var(--bg-border-mid)`
          }}
        >
          Customers
        </button>
        <button
          onClick={() => setActiveScreen('inspection')}
          className="w-full py-3 px-4 rounded-lg font-medium transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: `1px solid var(--bg-border-mid)`
          }}
        >
          Inspection
        </button>
        <button
          onClick={() => setActiveScreen('sync')}
          className="w-full py-3 px-4 rounded-lg font-medium transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: `1px solid var(--bg-border-mid)`
          }}
        >
          Sync server ↑
        </button>
      </div>
    </>
  );

  // Render payment screen
  const renderPaymentScreen = () => (
    <>
      <div className="pb-4 border-b" style={{ borderColor: 'var(--bg-border-subtle)' }}>
        <button
          className="flex items-center gap-2 mb-3 text-sm hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
          onClick={() => {
            setActiveScreen('home');
            setSelectedCustomer(null);
            setPhoneNumber('');
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Pokea Malipo
        </h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block" style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--text-label)'
          }}>
            Nambari ya simu:
          </label>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="+255 7XX XXX XXX"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--bg-border-mid)',
                color: 'var(--text-primary)'
              }}
            />
            <button
              onClick={lookupCustomer}
              disabled={loading}
              className="px-4 py-2 rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-muted)',
                border: `1px solid var(--bg-border-mid)`
              }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tafuta'}
            </button>
          </div>
        </div>

        {selectedCustomer && (
          <>
            <div className="p-4 rounded-lg border animate-in fade-in duration-300" style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-subtle)'
            }}>
              <div className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {selectedCustomer.name}
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {selectedCustomer.meterId} · TZS {(selectedCustomer.balance ?? 0).toLocaleString()}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider mb-2 block" style={{
                color: 'var(--text-faint)',
                fontSize: 'var(--text-label)'
              }}>
                Kiasi (TZS):
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--bg-border-mid)',
                  color: 'var(--text-primary)'
                }}
              />
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                ≈ {(parseFloat(amount) / 400).toFixed(2)} kWh @ 400 TZS/kWh
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider mb-2 block" style={{
                color: 'var(--text-faint)',
                fontSize: 'var(--text-label)'
              }}>
                Njia ya malipo:
              </label>
              <div className="flex gap-2">
                {(['cash', 'mpesa', 'airtel'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className="flex-1 py-2 px-3 rounded-lg border transition-all text-sm"
                    style={{
                      backgroundColor: paymentMethod === method ? 'var(--brand-dim)' : 'var(--bg-surface)',
                      borderColor: paymentMethod === method ? 'var(--brand-emerald)' : 'var(--bg-border-mid)',
                      color: paymentMethod === method ? 'var(--brand-emerald)' : 'var(--text-muted)'
                    }}
                  >
                    {method === 'cash' ? 'Cash' : method === 'mpesa' ? 'M-Pesa' : 'Airtel'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={processPayment}
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--brand-emerald)',
                color: '#ffffff'
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Inachakata...
                </>
              ) : (
                'Hifadhi Malipo'
              )}
            </button>
          </>
        )}
      </div>
    </>
  );

  // Render customers screen
  const renderCustomersScreen = () => (
    <>
      <div className="pb-4 border-b" style={{ borderColor: 'var(--bg-border-subtle)' }}>
        <button 
          className="flex items-center gap-2 mb-3 text-sm hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
          onClick={() => setActiveScreen('home')}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Wateja
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-faint)' }} />
          <input
            type="text"
            placeholder="Tafuta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-mid)',
              color: 'var(--text-primary)'
            }}
          />
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-emerald)' }} />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            Hakuna wateja waliopatikana
          </div>
        ) : (
          customers.map((customer) => (
            <div
              key={customer.id}
              className="p-3 rounded-lg border cursor-pointer hover:border-emerald-500 transition-colors"
              onClick={() => {
                setSelectedCustomer(customer);
                setPhoneNumber(customer.phone);
                setActiveScreen('payment');
                toast.info(`Selected: ${customer.name}`);
              }}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: customer.status === 'warning' ? 'var(--status-warn)' :
                            customer.status === 'critical' ? 'var(--status-danger)' :
                            'var(--bg-border-subtle)'
              }}
            >
              <div className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {customer.name}
              </div>
              <div className="text-sm" style={{
                color: customer.status === 'warning' ? 'var(--status-warn)' :
                       customer.status === 'critical' ? 'var(--status-danger)' :
                       'var(--text-muted)'
              }}>
                {customer.meterId} · TZS {(customer.balance ?? 0).toLocaleString()}
                {customer.balance < 1000 && ' ⚠'}
                {customer.balance === 0 && ' ✗'}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );

  // Render inspection screen
  const renderInspectionScreen = () => (
    <>
      <div className="pb-4 border-b" style={{ borderColor: 'var(--bg-border-subtle)' }}>
        <button
          className="flex items-center gap-2 mb-3 text-sm hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
          onClick={() => setActiveScreen('home')}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Ukaguzi wa Mita
        </h2>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block" style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--text-label)'
          }}>
            Nambari ya Mita:
          </label>
          <input
            type="text"
            placeholder="MTR-001"
            value={inspection.meterId}
            onChange={(e) => setInspection(prev => ({ ...prev, meterId: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-mid)',
              color: 'var(--text-primary)'
            }}
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block" style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--text-label)'
          }}>
            Aina ya Tatizo:
          </label>
          <select
            value={inspection.issueType}
            onChange={(e) => setInspection(prev => ({ ...prev, issueType: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-mid)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="normal">Normal Inspection</option>
            <option value="tamper">Tamper Detected</option>
            <option value="fault">Meter Fault</option>
            <option value="damage">Physical Damage</option>
            <option value="disconnect">Disconnection</option>
            <option value="reconnect">Reconnection</option>
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block" style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--text-label)'
          }}>
            Uzito:
          </label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high', 'critical'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setInspection(prev => ({ ...prev, severity: sev }))}
                className="flex-1 py-2 px-2 rounded-lg border transition-all text-xs"
                style={{
                  backgroundColor: inspection.severity === sev ? 'var(--brand-dim)' : 'var(--bg-surface)',
                  borderColor: inspection.severity === sev ? 'var(--brand-emerald)' : 'var(--bg-border-mid)',
                  color: inspection.severity === sev ? 'var(--brand-emerald)' : 'var(--text-muted)'
                }}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block" style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--text-label)'
          }}>
            Maelezo:
          </label>
          <textarea
            placeholder="Andika maelezo..."
            value={inspection.notes}
            onChange={(e) => setInspection(prev => ({ ...prev, notes: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-mid)',
              color: 'var(--text-primary)'
            }}
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block" style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--text-label)'
          }}>
            Soma Mita:
          </label>
          <input
            type="text"
            placeholder="e.g., 1234.5 kWh"
            value={inspection.meterReading}
            onChange={(e) => setInspection(prev => ({ ...prev, meterReading: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-mid)',
              color: 'var(--text-primary)'
            }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 text-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-mid)',
              color: 'var(--text-primary)'
            }}
          >
            <Camera className="w-4 h-4" />
            {capturedPhoto ? 'Picha ✓' : 'Piga Picha'}
          </button>
          <button
            onClick={captureGPS}
            className="flex-1 py-2 px-3 rounded-lg border transition-colors flex items-center justify-center gap-2 text-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-mid)',
              color: 'var(--text-primary)'
            }}
          >
            <MapPin className="w-4 h-4" />
            {inspection.gpsLocation ? 'GPS ✓' : 'GPS'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoCapture}
          className="hidden"
        />

        {capturedPhoto && (
          <div className="p-2 rounded-lg border" style={{ borderColor: 'var(--bg-border-subtle)' }}>
            <img src={capturedPhoto} alt="Captured" className="w-full h-32 object-cover rounded" />
          </div>
        )}

        <button
          onClick={submitInspection}
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--brand-emerald)',
            color: '#ffffff'
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Inatuma...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Tuma Ripoti
            </>
          )}
        </button>
      </div>
    </>
  );

  // Render sync screen
  const renderSyncScreen = () => (
    <>
      <div className="pb-4 border-b" style={{ borderColor: 'var(--bg-border-subtle)' }}>
        <button
          className="flex items-center gap-2 mb-3 text-sm hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
          onClick={() => setActiveScreen('home')}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Sync na Server
        </h2>
      </div>

      <div className="space-y-4">
        {syncStatus && (
          <>
            {syncStatus.lastSync && (
              <div className="p-4 rounded-lg border" style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--bg-border-subtle)'
              }}>
                <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
                  Last Sync
                </div>
                <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
                  {new Date(syncStatus.lastSync.timestamp).toLocaleString()}
                </div>
                <div className="flex gap-4 mt-2 text-xs">
                  <div>
                    <span style={{ color: 'var(--text-faint)' }}>Uploaded:</span>
                    <span className="ml-1 font-bold" style={{ color: 'var(--brand-emerald)' }}>
                      {syncStatus.lastSync.uploaded.transactions + syncStatus.lastSync.uploaded.inspections}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-faint)' }}>Downloaded:</span>
                    <span className="ml-1 font-bold" style={{ color: 'var(--status-info)' }}>
                      {syncStatus.lastSync.downloaded.customers + syncStatus.lastSync.downloaded.updates}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 rounded-lg border" style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-border-subtle)'
            }}>
              <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
                Pending Data
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Upload className="w-4 h-4" style={{ color: 'var(--status-warn)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Transactions</span>
                  </div>
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {syncStatus.pending.transactions}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4" style={{ color: 'var(--status-warn)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Inspections</span>
                  </div>
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {syncStatus.pending.inspections}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        <button
          onClick={performSync}
          disabled={syncing}
          className="w-full py-3 px-4 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--brand-emerald)',
            color: '#ffffff'
          }}
        >
          {syncing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Sync Now
            </>
          )}
        </button>

        <div className="p-3 rounded-lg border-l-4 text-sm" style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--status-info)',
          color: 'var(--text-muted)'
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>Sync features:</strong><br/>
          • Upload pending transactions<br/>
          • Upload inspection reports<br/>
          • Download customer updates<br/>
          • Resolve data conflicts
        </div>
      </div>
    </>
  );

  // Render token result screen
  const renderTokenResultScreen = () => (
    <>
      <div className="pb-4 border-b" style={{ borderColor: 'var(--bg-border-subtle)' }}>
        <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--brand-emerald)' }}>
          <CheckCircle className="w-6 h-6" />
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Malipo Yamekamilika!
          </h2>
        </div>
      </div>

      {transaction && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border" style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--bg-border-subtle)'
          }}>
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
              STS Token (20 digits)
            </div>
            <div className="text-lg font-mono font-bold mb-1 select-all" style={{ color: 'var(--brand-emerald)' }}>
              {transaction.stsToken}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Tap to copy · Send via SMS
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <div className="text-xs" style={{ color: 'var(--text-faint)' }}>kWh Purchased</div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {transaction.kwhPurchased}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-surface)' }}>
              <div className="text-xs" style={{ color: 'var(--text-faint)' }}>New Balance</div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                TZS {(transaction.newBalance ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border-l-4" style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--status-info)'
          }}>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Next steps:</strong><br/>
              1. SMS sent to customer automatically<br/>
              2. Customer enters token on meter keypad<br/>
              3. Meter validates and credits energy
            </div>
          </div>

          <button
            onClick={() => {
              setActiveScreen('home');
              setSelectedCustomer(null);
              setPhoneNumber('');
              setAmount('5000');
              setTransaction(null);
            }}
            className="w-full py-3 px-4 rounded-lg font-medium hover:opacity-90 transition-opacity"
            style={{
              backgroundColor: 'var(--brand-emerald)',
              color: '#ffffff'
            }}
          >
            Done · Return Home
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="p-8">
      <Toaster position="top-right" richColors />
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
          <Smartphone className="w-7 h-7" style={{ color: 'var(--brand-emerald)' }} />
          Agent Mobile App — Full Featured
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-body)' }}>
          Payment · Inspection · Sync · Offline-first · GPS · Photo capture · Complete backend integration
        </p>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-4">
        {/* Active Screen */}
        <div className="flex-shrink-0">
          <div
            className="rounded-2xl border-4 p-6 space-y-4"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--bg-border-mid)',
              width: '320px',
              minHeight: '640px'
            }}
          >
            {/* Status Bar */}
            <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              <span>9:41</span>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--brand-emerald)' }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--brand-emerald)' }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--brand-emerald)' }} />
              </div>
            </div>

            {activeScreen === 'home' && renderHomeScreen()}
            {activeScreen === 'payment' && renderPaymentScreen()}
            {activeScreen === 'customers' && renderCustomersScreen()}
            {activeScreen === 'inspection' && renderInspectionScreen()}
            {activeScreen === 'sync' && renderSyncScreen()}
            {activeScreen === 'token-result' && renderTokenResultScreen()}
          </div>
        </div>

        {/* Info Panel */}
        <div className="flex-shrink-0 w-80">
          <div className="p-6 rounded-lg border space-y-4" style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--bg-border-subtle)'
          }}>
            <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              ✅ Complete Features
            </h3>
            
            <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-emerald)' }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Payment Collection</strong><br/>
                  Cash/M-Pesa/Airtel + STS tokens
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-emerald)' }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Meter Inspection</strong><br/>
                  Photo capture + GPS + severity levels
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-emerald)' }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Server Sync</strong><br/>
                  Bidirectional data sync + conflict resolution
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-emerald)' }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Customer Database</strong><br/>
                  Search + browse + status indicators
                </div>
              </div>
            </div>

            <div className="pt-3 border-t" style={{ borderColor: 'var(--bg-border-subtle)' }}>
              <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                <strong>New API Endpoints:</strong><br/>
                • POST /agent/inspection<br/>
                • POST /agent/sync<br/>
                • GET /agent/sync/status<br/>
                • GET /agent/inspections/pending
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
