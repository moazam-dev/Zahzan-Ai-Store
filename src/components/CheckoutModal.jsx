import { useState, useEffect } from 'react'
import { X, CheckCircle, Truck, MapPin, AlertCircle, ShoppingBag, ShieldCheck, ArrowLeft, Upload, CreditCard, Building, Smartphone } from 'lucide-react'
import { useCart } from '../context/CartContext'

const API_BASE = '/api'

export default function CheckoutModal({
  isOpen,
  onClose,
  isBuyNow = false,
  buyNowProduct = null,
  buyNowSize = 'M',
  buyNowColor = '',
  buyNowQuantity = 1,
  onOrderSuccess = () => {}
}) {
  const { cartItems, cartTotal, clearCart, fetchCart } = useCart()
  
  // Step Navigation: 1 = Delivery Details, 2 = Payment Details, 3 = Confirmation
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState(null)

  // Payment Channels Config
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState([])

  // Customer Contact Info
  const [customerInfo, setCustomerInfo] = useState({
    fullName: '',
    email: '',
    phone: ''
  })

  // Shipping Address Form
  const [shippingAddress, setShippingAddress] = useState({
    fullName: '',
    phone: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: 'Lahore',
    state: 'Punjab',
    postalCode: '54000',
    country: 'Pakistan',
    deliveryInstructions: ''
  })

  // Step 2 Payment State
  const [paymentChoice, setPaymentChoice] = useState('cod') // 'cod' | 'advance'
  const [selectedAdvanceChannel, setSelectedAdvanceChannel] = useState('jazzcash')
  const [transactionRef, setTransactionRef] = useState('')
  const [proofFile, setProofFile] = useState(null)

  // Confirmation state
  const [confirmedOrder, setConfirmedOrder] = useState(null)
  const [submittedPaymentRecord, setSubmittedPaymentRecord] = useState(null)

  const getAuthToken = () => localStorage.getItem('zahzan_token')

  // Fetch user profile, saved addresses & payment methods on mount/open
  useEffect(() => {
    if (isOpen) {
      const token = getAuthToken()
      if (!token) return

      // Reset state on modal open
      setStep(1)
      setErrorMsg(null)
      setConfirmedOrder(null)
      setSubmittedPaymentRecord(null)
      setPaymentChoice('cod')
      setTransactionRef('')
      setProofFile(null)

      // Fetch Profile & Addresses
      fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user) {
            setUserProfile(data.user)
            setCustomerInfo({
              fullName: data.user.name || `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim(),
              email: data.user.email || '',
              phone: data.user.phone || ''
            })

            if (data.addresses && data.addresses.length > 0) {
              setSavedAddresses(data.addresses)
              const defaultAddr = data.addresses.find((a) => a.isDefault) || data.addresses[0]
              if (defaultAddr) {
                applyAddressToForm(defaultAddr, data.user)
              }
            }
          }
        })
        .catch((err) => console.error('Failed to load checkout user info:', err))

      // Fetch Payment Channels config
      fetch(`${API_BASE}/payments/methods`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.methods)) {
            setPaymentMethodsConfig(data.methods)
            if (data.methods.length > 0) {
              setSelectedAdvanceChannel(data.methods[0].id)
            }
          }
        })
        .catch((err) => console.error('Failed to load payment channels:', err))
    }
  }, [isOpen])

  const applyAddressToForm = (addr, userObj = userProfile) => {
    setSelectedAddressId(addr._id || addr.id)
    setShippingAddress({
      fullName: addr.recipientName || addr.fullName || (userObj ? userObj.name : ''),
      phone: addr.phone || (userObj ? userObj.phone : ''),
      email: userObj ? userObj.email : '',
      addressLine1: addr.addressLine1 || addr.streetAddress || '',
      addressLine2: addr.addressLine2 || addr.apartment || '',
      city: addr.city || 'Lahore',
      state: addr.state || addr.province || 'Punjab',
      postalCode: addr.postalCode || '54000',
      country: addr.country || 'Pakistan',
      deliveryInstructions: addr.deliveryInstructions || ''
    })
  }

  if (!isOpen) return null

  // Items list to render
  const checkoutItems = isBuyNow && buyNowProduct
    ? [
        {
          id: buyNowProduct.id || buyNowProduct._id,
          name: buyNowProduct.name,
          category: buyNowProduct.category,
          price: buyNowProduct.price,
          image: buyNowProduct.images?.[0] || buyNowProduct.image,
          size: buyNowSize,
          color: buyNowColor || buyNowProduct.color,
          quantity: buyNowQuantity,
          stock: buyNowProduct.stock
        }
      ]
    : cartItems

  const subtotal = isBuyNow && buyNowProduct
    ? buyNowProduct.price * buyNowQuantity
    : cartTotal

  const shippingCost = subtotal >= 20000 ? 0 : 250
  const finalTotal = subtotal + shippingCost

  // Active channel details object
  const activeChannelObj = paymentMethodsConfig.find((m) => m.id === selectedAdvanceChannel) || paymentMethodsConfig[0]

  // Step 1 -> Step 2 Validation
  const handleProceedToPayment = (e) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.addressLine1 || !shippingAddress.city) {
      setErrorMsg('Please fill in all required delivery address fields.')
      return
    }

    setStep(2)
  }

  // Handle File Upload Change
  const handleProofFileChange = (e) => {
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

  // Submit Final Order (COD or Advance Payment)
  const handleFinalOrderSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)
    const token = getAuthToken()

    if (!token) {
      setErrorMsg('Please sign in to complete your order.')
      return
    }

    if (paymentChoice === 'advance') {
      if (!transactionRef || !transactionRef.trim()) {
        setErrorMsg('Please enter your transaction reference / TRX ID.')
        return
      }
      if (!proofFile) {
        setErrorMsg('Please upload your payment proof screenshot or receipt PDF.')
        return
      }
    }

    try {
      setLoading(true)

      let res
      if (paymentChoice === 'cod') {
        // Submit JSON Payload for COD
        const payload = {
          customerInfo,
          shippingAddress,
          isBuyNow,
          buyNowItem: isBuyNow && buyNowProduct
            ? {
                productId: buyNowProduct.id || buyNowProduct._id,
                quantity: buyNowQuantity,
                selectedSize: buyNowSize,
                selectedColor: buyNowColor
              }
            : undefined,
          paymentChoice: 'cod',
          paymentMethod: 'Cash on Delivery'
        }

        res = await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })
      } else {
        // Submit Multipart FormData for Pay in Advance
        const formData = new FormData()
        formData.append('customerInfo', JSON.stringify(customerInfo))
        formData.append('shippingAddress', JSON.stringify(shippingAddress))
        formData.append('isBuyNow', String(isBuyNow))
        if (isBuyNow && buyNowProduct) {
          formData.append('buyNowItem', JSON.stringify({
            productId: buyNowProduct.id || buyNowProduct._id,
            quantity: buyNowQuantity,
            selectedSize: buyNowSize,
            selectedColor: buyNowColor
          }))
        }
        formData.append('paymentChoice', 'advance')
        formData.append('paymentMethod', activeChannelObj ? activeChannelObj.name : 'JazzCash')
        formData.append('transactionReference', transactionRef.trim())
        formData.append('proof', proofFile)

        res = await fetch(`${API_BASE}/orders`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        })
      }

      const data = await res.json()

      if (res.ok && data.success && data.order) {
        setConfirmedOrder(data.order)
        if (data.payment) {
          setSubmittedPaymentRecord(data.payment)
        }
        
        // Clear cart only on successful order creation
        if (!isBuyNow) {
          clearCart()
        }
        fetchCart()
        onOrderSuccess(data.order)
      } else {
        setErrorMsg(data.message || 'Failed to place order. Please check your information and try again.')
      }
    } catch (err) {
      console.error('Order submission error:', err)
      setErrorMsg('Server connection error. Please check your network.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={confirmedOrder ? onClose : undefined}
      />

      {/* Drawer Canvas */}
      <div className="fixed inset-0 z-10 flex justify-end overflow-y-auto">
        <div className="bg-[#faf8f5] text-[#1c1b18] w-full max-w-2xl min-h-full border-l border-[#e8e4dc] shadow-2xl flex flex-col justify-between overflow-y-auto no-scrollbar">
          
          {/* Header */}
          <div className="sticky top-0 z-20 bg-[#faf8f5]/95 backdrop-blur-xs px-6 py-5 sm:px-8 flex items-center justify-between border-b border-[#e8e4dc]">
            <div>
              <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                {confirmedOrder
                  ? 'ZAHZAN BESPOKE CHECKOUT'
                  : `STEP ${step} OF 2 — ${step === 1 ? 'DELIVERY DETAILS' : 'PAYMENT SELECTION'}`}
              </span>
              <h2 className="font-serif text-2xl font-light text-[#1c1b18]">
                {confirmedOrder ? 'Order Confirmed' : step === 1 ? 'Delivery Information' : 'Payment & Complete Order'}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-2 px-3 hover:text-[#5a5e4b] transition-colors cursor-pointer"
            >
              CLOSE ×
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 px-6 py-6 sm:px-8 space-y-8">
            
            {/* ========================================================================= */}
            {/* STEP 3: ORDER CONFIRMED SCREEN */}
            {/* ========================================================================= */}
            {confirmedOrder ? (
              <div className="py-8 space-y-6 text-center animate-fadeIn">
                <div className="w-16 h-16 bg-[#f0f4ec] border border-[#b4c4a4] rounded-full flex items-center justify-center mx-auto text-[#5a5e4b]">
                  <CheckCircle size={32} />
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                    THANK YOU FOR YOUR SELECTION
                  </span>
                  <h3 className="font-serif text-3xl font-light text-[#1c1b18]">
                    Order #{confirmedOrder.orderNumber}
                  </h3>
                  <p className="text-xs font-sans text-[#706c64] max-w-md mx-auto leading-relaxed">
                    A confirmation record has been generated and dispatched to your account profile (<span className="font-medium text-[#1c1b18]">{confirmedOrder.customerEmail}</span>).
                  </p>
                </div>

                {/* Summary Card */}
                <div className="bg-white border border-[#e8e4dc] p-5 rounded-xs text-left space-y-4 max-w-lg mx-auto text-xs font-sans">
                  <div className="flex items-center justify-between border-b border-[#e8e4dc] pb-3">
                    <span className="uppercase tracking-wider text-[#5a5e4b] font-medium">Order Status</span>
                    <span className="px-2.5 py-0.5 bg-[#f0f4ec] border border-[#b4c4a4] text-[#5a5e4b] uppercase tracking-widest text-[10px] font-semibold">
                      {confirmedOrder.orderStatus}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-[#e8e4dc] pb-3">
                    <span className="uppercase tracking-wider text-[#5a5e4b] font-medium">Payment Choice</span>
                    <span className="px-2.5 py-0.5 bg-[#faf8f5] border border-[#e8e4dc] text-[#1c1b18] uppercase tracking-widest text-[10px] font-semibold">
                      {confirmedOrder.paymentMethod}
                    </span>
                  </div>

                  <div className="space-y-2 border-b border-[#e8e4dc] pb-3">
                    <span className="uppercase tracking-wider text-[#5a5e4b] font-medium block">Delivery Destination</span>
                    <p className="text-[#1c1b18] font-normal leading-relaxed">
                      <strong>{confirmedOrder.shippingAddress.fullName}</strong><br />
                      {confirmedOrder.shippingAddress.addressLine1} {confirmedOrder.shippingAddress.addressLine2}<br />
                      {confirmedOrder.shippingAddress.city}, {confirmedOrder.shippingAddress.state} {confirmedOrder.shippingAddress.postalCode}<br />
                      {confirmedOrder.shippingAddress.country}<br />
                      Ph: {confirmedOrder.shippingAddress.phone}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1 font-serif text-base text-[#1c1b18]">
                    <span>Total Amount</span>
                    <span>PKR {confirmedOrder.total.toLocaleString()}</span>
                  </div>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    type="button"
                    onClick={onClose}
                    className="bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-3.5 px-8 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    CONTINUE SHOPPING
                  </button>
                  <a
                    href="/account?tab=orders"
                    className="bg-white border border-[#1c1b18] text-[#1c1b18] text-xs font-sans uppercase tracking-[0.25em] py-3.5 px-8 hover:bg-[#1c1b18] hover:text-[#faf8f5] transition-colors text-center inline-block"
                  >
                    TRACK IN ORDER HISTORY →
                  </a>
                </div>
              </div>

            ) : step === 1 ? (
              
              /* ========================================================================= */
              /* STEP 1: DELIVERY & RECIPIENT INFORMATION */
              /* ========================================================================= */
              <form onSubmit={handleProceedToPayment} className="space-y-8">
                
                {/* Error Banner */}
                {errorMsg && (
                  <div className="p-4 bg-[#fdf2f2] border border-[#f4c7c7] text-[#8a2222] text-xs font-sans flex items-start gap-2 rounded-xs">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* 01. ORDER ARTICLES SUMMARY */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#e8e4dc] pb-2">
                    <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b]">
                      01. ARTICLES SUMMARY ({checkoutItems.length})
                    </span>
                    {isBuyNow && (
                      <span className="text-[9px] font-sans uppercase tracking-widest bg-[#1c1b18] text-[#faf8f5] px-2 py-0.5">
                        EXPRESS BUY NOW
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 max-h-48 overflow-y-auto no-scrollbar pr-1">
                    {checkoutItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-white p-3 border border-[#e8e4dc]/80 rounded-xs">
                        <img src={item.image} alt={item.name} className="w-12 h-16 object-cover bg-[#eee]" />
                        <div className="flex-1 text-xs font-sans space-y-0.5">
                          <span className="text-[9px] uppercase tracking-widest text-[#5a5e4b] block">{item.category}</span>
                          <h4 className="font-serif text-base text-[#1c1b18] font-normal leading-tight">{item.name}</h4>
                          <span className="text-[11px] text-[#706c64] block">
                            Size: <span className="text-[#1c1b18] font-medium">{item.size}</span> | Qty: <span className="text-[#1c1b18] font-medium">{item.quantity}</span>
                          </span>
                        </div>
                        <span className="text-xs font-sans font-medium text-[#1c1b18]">
                          PKR {(item.price * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 02. SAVED ADDRESS SELECTION */}
                {savedAddresses.length > 0 && (
                  <div className="space-y-3">
                    <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block border-b border-[#e8e4dc] pb-2">
                      02. CHOOSE SAVED ADDRESS
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {savedAddresses.map((addr) => {
                        const isSelected = selectedAddressId === (addr._id || addr.id)
                        return (
                          <button
                            key={addr._id || addr.id}
                            type="button"
                            onClick={() => applyAddressToForm(addr)}
                            className={`p-3 text-left border text-xs font-sans rounded-xs transition-all cursor-pointer ${
                              isSelected
                                ? 'border-[#1c1b18] bg-white shadow-xs'
                                : 'border-[#e8e4dc] bg-transparent text-[#706c64] hover:border-[#1c1b18]'
                            }`}
                          >
                            <div className="flex items-center justify-between font-medium text-[#1c1b18] mb-1">
                              <span>{addr.label || addr.recipientName}</span>
                              {isSelected && <span className="text-[10px] text-[#5a5e4b]">✓ SELECTED</span>}
                            </div>
                            <p className="text-[11px] text-[#706c64] line-clamp-2 leading-relaxed">
                              {addr.addressLine1}, {addr.city}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 03. DELIVERY / SHIPPING INFORMATION */}
                <div className="space-y-4">
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block border-b border-[#e8e4dc] pb-2">
                    03. SHIPPING & RECIPIENT DETAILS
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1">
                        Recipient Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingAddress.fullName}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                        className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-sans text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                        placeholder="e.g. Ayesha Malik"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={shippingAddress.phone}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                        className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-sans text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                        placeholder="+92 300 1234567"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1">
                      Street Address Line 1 *
                    </label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.addressLine1}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine1: e.target.value })}
                      className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-sans text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                      placeholder="House/Apartment #, Street, Phase / Block"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingAddress.city}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                        className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-sans text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                        placeholder="Lahore"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1">
                        Province / State *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingAddress.state}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                        className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-sans text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                        placeholder="Punjab"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1">
                        Postal Code *
                      </label>
                      <input
                        type="text"
                        required
                        value={shippingAddress.postalCode}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
                        className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-sans text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                        placeholder="54000"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1">
                      Special Delivery Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      value={shippingAddress.deliveryInstructions}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, deliveryInstructions: e.target.value })}
                      className="w-full bg-white border border-[#e8e4dc] p-3 text-xs font-sans text-[#1c1b18] focus:outline-none focus:border-[#1c1b18]"
                      placeholder="e.g. Leave with security guard if unavailable"
                    />
                  </div>
                </div>

                {/* 04. PRICING BREAKDOWN */}
                <div className="bg-white p-5 border border-[#e8e4dc] space-y-2 text-xs font-sans">
                  <div className="flex justify-between text-[#706c64]">
                    <span>Items Subtotal</span>
                    <span className="text-[#1c1b18] font-medium">PKR {subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[#706c64]">
                    <span>Express Shipping</span>
                    <span className="text-[#1c1b18] font-medium">
                      {shippingCost === 0 ? 'FREE (Orders over PKR 20,000)' : `PKR ${shippingCost.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="border-t border-[#e8e4dc] pt-3 flex justify-between font-serif text-lg text-[#1c1b18] font-light">
                    <span>Total Order Amount</span>
                    <span>PKR {finalTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* STEP 1 ACTION BUTTON */}
                <div>
                  <button
                    type="submit"
                    disabled={checkoutItems.length === 0}
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans font-medium uppercase tracking-[0.3em] py-4 px-6 hover:bg-[#5a5e4b] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    CONTINUE TO PAYMENT — PKR {finalTotal.toLocaleString()} →
                  </button>
                </div>

              </form>

            ) : (

              /* ========================================================================= */
              /* STEP 2: PAYMENT CHOICE & PAYMENT SUBMISSION */
              /* ========================================================================= */
              <form onSubmit={handleFinalOrderSubmit} className="space-y-6">
                
                {/* Back Button */}
                <button
                  type="button"
                  onClick={() => { setStep(1); setErrorMsg(null); }}
                  className="inline-flex items-center gap-2 text-xs font-sans uppercase tracking-wider text-[#5a5e4b] hover:text-[#1c1b18] cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Back to Delivery Information</span>
                </button>

                {/* Error Banner */}
                {errorMsg && (
                  <div className="p-4 bg-[#fdf2f2] border border-[#f4c7c7] text-[#8a2222] text-xs font-sans flex items-start gap-2 rounded-xs">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Order Summary Pill */}
                <div className="bg-white p-4 border border-[#e8e4dc] flex items-center justify-between font-sans">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#5a5e4b] block">Payable Total</span>
                    <span className="font-serif text-xl font-light text-[#1c1b18]">PKR {finalTotal.toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] font-sans uppercase tracking-widest bg-[#f0f4ec] text-[#5a5e4b] border border-[#b4c4a4] px-2.5 py-1 font-semibold">
                    {shippingAddress.city}, Pakistan
                  </span>
                </div>

                {/* 01. PAYMENT CHOICE SELECTOR */}
                <div className="space-y-3">
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block border-b border-[#e8e4dc] pb-1.5">
                    SELECT PAYMENT METHOD
                  </span>

                  <div className="grid grid-cols-2 gap-4">
                    {/* COD Option */}
                    <button
                      type="button"
                      onClick={() => setPaymentChoice('cod')}
                      className={`p-4 border text-left rounded-xs transition-all cursor-pointer ${
                        paymentChoice === 'cod'
                          ? 'border-[#1c1b18] bg-white shadow-xs'
                          : 'border-[#e8e4dc] bg-transparent hover:border-[#1c1b18]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-sans font-medium text-xs text-[#1c1b18] uppercase tracking-wider">
                          Cash on Delivery
                        </span>
                        {paymentChoice === 'cod' && <span className="text-[10px] text-[#5a5e4b]">✓ SELECTED</span>}
                      </div>
                      <p className="text-[11px] font-sans text-[#706c64]">
                        Pay in cash upon physical delivery at your doorstep.
                      </p>
                    </button>

                    {/* Pay in Advance Option */}
                    <button
                      type="button"
                      onClick={() => setPaymentChoice('advance')}
                      className={`p-4 border text-left rounded-xs transition-all cursor-pointer ${
                        paymentChoice === 'advance'
                          ? 'border-[#1c1b18] bg-white shadow-xs'
                          : 'border-[#e8e4dc] bg-transparent hover:border-[#1c1b18]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-sans font-medium text-xs text-[#1c1b18] uppercase tracking-wider">
                          Pay in Advance
                        </span>
                        {paymentChoice === 'advance' && <span className="text-[10px] text-[#5a5e4b]">✓ SELECTED</span>}
                      </div>
                      <p className="text-[11px] font-sans text-[#706c64]">
                        JazzCash, Easypaisa, or Bank IBFT with proof upload.
                      </p>
                    </button>
                  </div>
                </div>

                {/* PAY IN ADVANCE SPECIFICS */}
                {paymentChoice === 'advance' && (
                  <div className="space-y-5 animate-fadeIn">
                    
                    {/* Advance Channel Choice */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] block">
                        Choose Advance Payment Channel
                      </span>
                      <div className="grid grid-cols-3 gap-3">
                        {paymentMethodsConfig.map((m) => {
                          const isSelected = selectedAdvanceChannel === m.id
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSelectedAdvanceChannel(m.id)}
                              className={`p-2.5 text-center border text-xs font-sans rounded-xs transition-all cursor-pointer ${
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

                    {/* Account Info Box */}
                    {activeChannelObj && (
                      <div className="bg-white p-4 border border-[#e8e4dc] space-y-2 text-xs font-sans">
                        <span className="text-[10px] uppercase tracking-widest text-[#5a5e4b] font-medium block">
                          ZAHZAN {activeChannelObj.name} Account Details
                        </span>
                        
                        {activeChannelObj.bankName && (
                          <div className="text-[#1c1b18] font-medium">Bank: {activeChannelObj.bankName}</div>
                        )}
                        <div className="text-[#1c1b18]">
                          Account Title: <strong>{activeChannelObj.accountTitle}</strong>
                        </div>
                        {activeChannelObj.accountNumber && (
                          <div className="text-[#1c1b18]">
                            Account / Mobile #: <strong className="font-mono text-sm">{activeChannelObj.accountNumber}</strong>
                          </div>
                        )}
                        {activeChannelObj.iban && (
                          <div className="text-[#1c1b18]">
                            IBAN: <strong className="font-mono">{activeChannelObj.iban}</strong>
                          </div>
                        )}

                        <p className="text-[11px] text-[#706c64] leading-relaxed pt-1 border-t border-[#e8e4dc]/70">
                          {activeChannelObj.instructions}
                        </p>
                      </div>
                    )}

                    {/* Transaction Reference ID */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b]">
                        Transaction Reference / TRX ID *
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

                    {/* Payment Proof File Upload */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b]">
                        Upload Payment Screenshot / Receipt PDF *
                      </label>
                      
                      <div className="border border-dashed border-[#e8e4dc] bg-white p-4 text-center space-y-2">
                        <input
                          type="file"
                          id="checkout-proof-upload"
                          accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                          onChange={handleProofFileChange}
                          className="hidden"
                        />
                        <label
                          htmlFor="checkout-proof-upload"
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

                  </div>
                )}

                {/* SUBMIT ORDER BUTTON */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading || (paymentChoice === 'advance' && (!transactionRef || !proofFile))}
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans font-medium uppercase tracking-[0.3em] py-4 px-6 hover:bg-[#5a5e4b] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loading
                      ? 'PROCESSING ORDER...'
                      : paymentChoice === 'cod'
                      ? `PLACE ORDER (CASH ON DELIVERY) — PKR ${finalTotal.toLocaleString()} →`
                      : `COMPLETE ORDER & SUBMIT PAYMENT — PKR ${finalTotal.toLocaleString()} →`}
                  </button>
                </div>

              </form>
            )}

          </div>

        </div>
      </div>
    </div>
  )
}
