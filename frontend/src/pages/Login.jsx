import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import toast from 'react-hot-toast';
import { ShieldAlert } from 'lucide-react';
import Logo from '../components/Logo';

const EMAIL_DOMAIN = '@thesouledstore.com';
const ADMIN_CONTACT = 'devansh.saxena@thesouledstore.com';

export default function Login() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const normalizedEmail = email.toLowerCase().trim();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!normalizedEmail) {
      toast.error('Enter your email');
      return;
    }
    if (!normalizedEmail.endsWith(EMAIL_DOMAIN)) {
      toast.error(`Only ${EMAIL_DOMAIN} email addresses are allowed`);
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.requestOtp(normalizedEmail);
      setPendingApproval(!!data.pending_approval);
      if (data.authorized) {
        toast.success('OTP sent to your Slack DM');
      }
      setStep('otp');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      toast.error(pendingApproval ? 'Enter the OTP shared by Devansh' : 'Enter the OTP from Slack');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(normalizedEmail, otp.trim());
      login(data.token, data.user);
      toast.success(`Welcome, ${data.user.name || data.user.email}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-tss-dark via-tss-navy to-tss-blue p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-tss-red opacity-5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-500 opacity-5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4 shadow-lg rounded-2xl">
            <Logo size={64} className="rounded-2xl" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">The Souled Store</h1>
          <p className="text-gray-400 mt-1 text-sm">Store Management Dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign in with Slack OTP</h2>
          <p className="text-sm text-gray-500 mb-6">
            {step === 'email'
              ? 'Enter your Souled Store email to receive a one-time code on Slack.'
              : pendingApproval
                ? `Access approval is required for ${normalizedEmail}`
                : `We sent a code to Slack for ${normalizedEmail}`}
          </p>

          {step === 'email' ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`you${EMAIL_DOMAIN}`}
                  className="input"
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-2.5 text-base flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  'Send OTP on Slack'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              {pendingApproval && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="flex gap-2">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-600" />
                    <div>
                      <p className="font-medium">You are not authorised to access this portal yet.</p>
                      <p className="mt-1 text-amber-800">
                        Please check with{' '}
                        <a href={`mailto:${ADMIN_CONTACT}`} className="font-medium underline">
                          {ADMIN_CONTACT}
                        </a>{' '}
                        for the OTP to get logged in. MrSoul has notified them of your request.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">One-time password</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  className="input text-center text-lg tracking-widest font-mono"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-2.5 text-base flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Sign In'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setOtp('');
                  setPendingApproval(false);
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
