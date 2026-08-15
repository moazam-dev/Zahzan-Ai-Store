'use client'

import { useState, useEffect } from 'react'
import { X, Upload, CheckCircle, AlertCircle, ShieldCheck, CreditCard, Building, Smartphone } from 'lucide-react'

const API_BASE = '/api'

export default function SubmitPaymentModal({ isOpen, onClose, order, onPaymentSubmitted = () => {} }) {
  const [methods, setMethods] = useState([])
  const [selectedMethodId, setSelectedMethodId] = useState('jazzcash')
  const [transactionRef, setTransactionRef] = useState('')
  const [proofFile, setProofFile] = useState(null)
  
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [successState, setSuccessState] = useState(false)

  const getAuthToken = () => localStorage.getItem('zahzan_token')

  // Fetch active payment methods configuration
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null)
      setSuccessState(false)
      setTransactionRef('')
      setProofFile(null)

      fetch(`${API_BASE}/payments/methods`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.methods)) {
            setMethods(data.methods)
            if (data.methods.length > 0) {
              setSelectedMethodId(data.methods[0].id)
            }
          }
        })
        .catch((err) => console.error('Failed to fetch payment methods:', err))
    }
  }, [isOpen])

  if (!isOpen || !order) return null

  const selectedMethodObj = methods.find((m) => m.id === selectedMethodId) || methods[0]

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('File size exceeds 5MB limit. Please select a smaller file.')
        setProofFile(null)
        return
      }
      setErrorMsg(null)
      setProofFile(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)
    const token = getAuthToken()

    if (!token) {
      setErrorMsg('Please sign in to submit payment proof.')
      return
    }

    if (!transactionRef || !transactionRef.trim()) {
      setErrorMsg('Please enter your transaction reference / ID.')
      return
    }

    if (!proofFile) {
      setErrorMsg('Please select your payment screenshot or receipt file.')
      return
    }

    try {
      setLoading(true)
      const formData = new FormData()
      formData.append('orderId', order._id || order.id)
      formData.append('paymentMethod', selectedMethodObj ? selectedMethodObj.name : 'JazzCash')
      formData.append('transactionReference', transactionRef.trim())
      formData.append('proof', proofFile)

      const res = await fetch(`${API_BASE}/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setSuccessState(true)
        onPaymentSubmitted(data.payment)
      } else {
        setErrorMsg(data.message || 'Failed to submit payment proof.')
      }
    } catch (err) {
      console.error('Payment submission error:', err)
      setErrorMsg('Error connecting to backend server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] overflow-hidden flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div className="bg-[#faf8f5] text-[#1c1b18] w-full max-w-xl border border-[#e8e4dc] shadow-2xl rounded-xs flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#faf8f5] px-6 py-5 flex items-center justify-between border-b border-[#e8e4dc]">
          <div>
            <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
              SECURE MANUAL PAYMENT SUBMISSION
            </span>
            <h2 className="font-serif text-2xl font-light text-[#1c1b18]">
              {successState ? 'Payment Submitted' : `Submit Payment for Order #${order.orderNumber}`}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-1 px-2 hover:text-[#5a5e4b] transition-colors cursor-pointer"
          >
            CLOSE ×
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
          
          {successState ? (
            <div className="py-8 text-center space-y-5 animate-fadeIn">
              <div className="w-16 h-16 bg-[#f0f4ec] border border-[#b4c4a4] rounded-full flex items-center justify-center mx-auto text-[#5a5e4b]">
                <CheckCircle size={32} />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                  TRANSACTION RECORDED
                </span>
                <h3 className="font-serif text-3xl font-light text-[#1c1b18]">
                  Verification Pending
                </h3>
                <p className="text-xs font-sans text-[#706c64] max-w-md mx-auto leading-relaxed">
                  Your payment reference (<span className="font-mono text-[#1c1b18] font-semibold">{transactionRef}</span>) has been submitted for Order <span className="font-mono text-[#1c1b18] font-semibold">{order.orderNumber}</span>. ZAHZAN management will verify the funds shortly.
                </p>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-3.5 px-8 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                >
                  RETURN TO ORDERS
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Error Banner */}
              {errorMsg && (
                <div className="p-3.5 bg-[#fdf2f2] border border-[#f4c7c7] text-[#8a2222] text-xs font-sans flex items-start gap-2 rounded-xs">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Order Total Banner */}
              <div className="bg-white p-4 border border-[#e8e4dc] flex items-center justify-between font-sans">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#5a5e4b] block">Authoritative Order Total</span>
                  <span className="font-serif text-xl font-light text-[#1c1b18]">PKR {order.total?.toLocaleString()}</span>
                </div>
                <span className="text-[10px] font-sans uppercase tracking-widest bg-[#f0f4ec] text-[#5a5e4b] border border-[#b4c4a4] px-2.5 py-1 font-semibold">
                  PAYABLE AMOUNT
                </span>
              </div>

              {/* 01. SELECT PAYMENT METHOD */}
              <div className="space-y-3">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block border-b border-[#e8e4dc] pb-1.5">
                  01. SELECT PAYMENT CHANNEL
                </span>

                <div className="grid grid-cols-3 gap-3">
                  {methods.map((m) => {
                    const isSelected = selectedMethodId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMethodId(m.id)}
                        className={`p-3 text-center border text-xs font-sans rounded-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#1c1b18] bg-white shadow-xs font-medium text-[#1c1b18]'
                            : 'border-[#e8e4dc] bg-transparent text-[#706c64] hover:border-[#1c1b18]'
                        }`}
                      >
                        <span className="block uppercase tracking-wider text-[11px]">{m.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ACCOUNT DETAILS & INSTRUCTIONS */}
              {selectedMethodObj && (
                <div className="bg-white p-4 border border-[#e8e4dc] space-y-2 text-xs font-sans">
                  <span className="text-[10px] uppercase tracking-widest text-[#5a5e4b] font-medium block">
                    {selectedMethodObj.name} Account Details
                  </span>
                  
                  {selectedMethodObj.bankName && (
                    <div className="text-[#1c1b18] font-medium">Bank: {selectedMethodObj.bankName}</div>
                  )}
                  <div className="text-[#1c1b18]">
                    Account Title: <strong>{selectedMethodObj.accountTitle}</strong>
                  </div>
                  {selectedMethodObj.accountNumber && (
                    <div className="text-[#1c1b18]">
                      Account / Mobile #: <strong className="font-mono text-sm">{selectedMethodObj.accountNumber}</strong>
                    </div>
                  )}
                  {selectedMethodObj.iban && (
                    <div className="text-[#1c1b18]">
                      IBAN: <strong className="font-mono">{selectedMethodObj.iban}</strong>
                    </div>
                  )}

                  <p className="text-[11px] text-[#706c64] leading-relaxed pt-1 border-t border-[#e8e4dc]/70">
                    {selectedMethodObj.instructions}
                  </p>
                </div>
              )}

              {/* 02. TRANSACTION REFERENCE ID */}
              <div className="space-y-2">
                <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b]">
                  02. Transaction Reference / TRX ID *
                </label>
                <input
                  type="text"
                  required
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="e.g. 12-digit JazzCash TID or IBFT reference"
                  className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-mono text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                />
              </div>

              {/* 03. PAYMENT PROOF FILE UPLOAD */}
              <div className="space-y-2">
                <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b]">
                  03. Payment Proof Screenshot / PDF Receipt *
                </label>
                
                <div className="border border-dashed border-[#e8e4dc] bg-white p-4 text-center space-y-2">
                  <input
                    type="file"
                    id="proof-upload"
                    accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="proof-upload"
                    className="inline-flex items-center gap-2 text-xs font-sans uppercase tracking-wider text-[#1c1b18] border border-[#1c1b18] px-4 py-2 hover:bg-[#1c1b18] hover:text-white transition-colors cursor-pointer"
                  >
                    <Upload size={14} />
                    <span>Choose File (Max 5MB)</span>
                  </label>
                  
                  {proofFile ? (
                    <span className="block text-xs font-mono text-[#5a5e4b] font-medium">
                      ✓ Selected: {proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)
                    </span>
                  ) : (
                    <span className="block text-[11px] font-sans text-[#706c64]">
                      Accepted formats: JPG, PNG, WEBP, PDF
                    </span>
                  )}
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !transactionRef || !proofFile}
                  className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans font-medium uppercase tracking-[0.3em] py-4 px-6 hover:bg-[#5a5e4b] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'SUBMITTING PROOF...' : 'SUBMIT PAYMENT PROOF →'}
                </button>
              </div>

            </form>
          )}

        </div>

      </div>
    </div>
  )
}
