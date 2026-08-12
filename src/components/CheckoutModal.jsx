import { useState, useEffect } from 'react'
import { X, CheckCircle, Truck, MapPin, AlertCircle, ShoppingBag, ShieldCheck } from 'lucide-react'
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
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState(null)

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

  // Confirmation state
  const [confirmedOrder, setConfirmedOrder] = useState(null)

  const getAuthToken = () => localStorage.getItem('zahzan_token')

  // Fetch user profile and saved addresses on mount/open
  useEffect(() => {
    if (isOpen) {
      const token = getAuthToken()
      if (!token) return

      // Reset state
      setErrorMsg(null)
      setConfirmedOrder(null)

      // Fetch Profile
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

            // If addresses available
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

  const handlePlaceOrder = async (e) => {
    e.preventDefault()
    setErrorMsg(null)
    const token = getAuthToken()

    if (!token) {
      setErrorMsg('Please sign in to place your order.')
      return
    }

    if (!shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.addressLine1 || !shippingAddress.city) {
      setErrorMsg('Please fill in all required shipping address fields.')
      return
    }

    try {
      setLoading(true)
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
          : undefined
      }

      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (res.ok && data.success && data.order) {
        setConfirmedOrder(data.order)
        if (!isBuyNow) {
          clearCart()
        }
        fetchCart()
        onOrderSuccess(data.order)
      } else {
        setErrorMsg(data.message || 'Failed to place order. Please try again.')
      }
    } catch (err) {
      console.error('Order placement error:', err)
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
                ZAHZAN BESPOKE CHECKOUT
              </span>
              <h2 className="font-serif text-2xl font-light text-[#1c1b18]">
                {confirmedOrder ? 'Order Confirmed' : 'Complete Your Order'}
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
            {/* ORDER CONFIRMED SCREEN */}
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
                    <span className="uppercase tracking-wider text-[#5a5e4b] font-medium">Status</span>
                    <span className="px-2.5 py-0.5 bg-[#f0f4ec] border border-[#b4c4a4] text-[#5a5e4b] uppercase tracking-widest text-[10px] font-semibold">
                      {confirmedOrder.orderStatus}
                    </span>
                  </div>

                  <div className="space-y-2 border-b border-[#e8e4dc] pb-3">
                    <span className="uppercase tracking-wider text-[#5a5e4b] font-medium block">Delivery Address</span>
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
                </div>
              </div>
            ) : (
              
              /* ========================================================================= */
              /* CHECKOUT FORM & SUMMARY */
              /* ========================================================================= */
              <form onSubmit={handlePlaceOrder} className="space-y-8">
                
                {/* Error Banner */}
                {errorMsg && (
                  <div className="p-4 bg-[#fdf2f2] border border-[#f4c7c7] text-[#8a2222] text-xs font-sans flex items-start gap-2 rounded-xs">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* 01. ORDER ITEMS SUMMARY */}
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

                {/* SUBMIT BUTTON */}
                <div>
                  <button
                    type="submit"
                    disabled={loading || checkoutItems.length === 0}
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans font-medium uppercase tracking-[0.3em] py-4 px-6 hover:bg-[#5a5e4b] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'PROCESSING ORDER...' : `PLACE ORDER — PKR ${finalTotal.toLocaleString()} →`}
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
