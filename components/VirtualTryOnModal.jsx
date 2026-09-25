'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  Sparkles,
  Upload,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Download,
  ShoppingBag,
  Info
} from 'lucide-react'

// Curated preset models for instantaneous testing
const PRESET_MODELS = [
  {
    id: 'model-1',
    name: 'Model A (Standing)',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 'model-2',
    name: 'Model B (Studio)',
    url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 'model-3',
    name: 'Model C (Full Pose)',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80'
  }
]

export default function VirtualTryOnModal({
  isOpen,
  onClose,
  product,
  onAddToCart
}) {
  const [selectedPhotoSource, setSelectedPhotoSource] = useState('preset') // 'preset' | 'upload'
  const [selectedPreset, setSelectedPreset] = useState(PRESET_MODELS[0].url)
  const [userUploadedPhoto, setUserUploadedPhoto] = useState(null)
  const [category, setCategory] = useState('dresses') // 'dresses' | 'tops' | 'bottoms'
  
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [errorMsg, setErrorMsg] = useState(null)
  
  const [resultImage, setResultImage] = useState(null)

  const fileInputRef = useRef(null)

  // Loading steps animation
  useEffect(() => {
    let interval
    if (isLoading) {
      setLoadingStep(0)
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < 3 ? prev + 1 : prev))
      }, 4500)
    }
    return () => clearInterval(interval)
  }, [isLoading])

  if (!isOpen || !product) return null

  const garmentImage =
    product.images?.[0] || product.image || product.featuredImage || '/placeholder-dress.jpg'

  const activePersonPhoto =
    selectedPhotoSource === 'upload' ? userUploadedPhoto : selectedPreset

  // Handle local image upload
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (JPG, PNG, WebP).')
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 8MB. Please choose a smaller photo.')
      return
    }

    setErrorMsg(null)
    const reader = new FileReader()
    reader.onload = () => {
      setUserUploadedPhoto(reader.result)
      setSelectedPhotoSource('upload')
    }
    reader.readAsDataURL(file)
  }

  // Poll prediction status
  const pollStatus = async (predictionId) => {
    let attempts = 0
    // IDM-VTON typically takes 20-40s and can exceed a minute under load, so
    // the old 30-attempt (~60s) budget reported "timed out" on jobs that were
    // about to succeed. 90 attempts = ~3 minutes.
    const maxAttempts = 90

    const checkInterval = setInterval(async () => {
      attempts++
      try {
        const token = localStorage.getItem('zahzan_token')
        const res = await fetch(`/api/try-on/${predictionId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const data = await res.json()

        if (data.status === 'succeeded' && data.output) {
          clearInterval(checkInterval)
          setResultImage(data.output)
          setIsLoading(false)
        } else if (data.status === 'failed' || data.status === 'canceled') {
          clearInterval(checkInterval)
          setIsLoading(false)
          setErrorMsg(data.error || 'AI Try-On processing encountered an error.')
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval)
          setIsLoading(false)
          setErrorMsg('Generation timed out. Please try again.')
        }
      } catch (err) {
        clearInterval(checkInterval)
        setIsLoading(false)
        setErrorMsg(err.message || 'Network error while checking generation status.')
      }
    }, 2000)
  }

  // Submit Try-On job
  const handleGenerateTryOn = async () => {
    if (!activePersonPhoto) {
      setErrorMsg('Please select or upload a person photo.')
      return
    }

    setErrorMsg(null)
    setIsLoading(true)
    setResultImage(null)

    try {
      // The endpoint requires authentication -- every generation is billable
      // AI time, so it is not open to anonymous callers.
      const token = localStorage.getItem('zahzan_token')
      if (!token) {
        setIsLoading(false)
        setErrorMsg('Please sign in to use Virtual Try-On.')
        return
      }

      const res = await fetch('/api/try-on', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          humanImage: activePersonPhoto,
          // No garmentImage: the backend resolves the garment from productId
          // against the database. Letting the browser nominate the image would
          // let anyone point the model at an arbitrary URL on our budget.
          productId: product?.id || product?._id || null,
          color: product?.color || '',
          category: category,
          garmentDescription: `${product.name} - ${product.fabric || 'luxury apparel'}`
        })
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setIsLoading(false)
        setErrorMsg(data.message || 'Failed to initialize Virtual Try-On.')
        return
      }

      if (data.status === 'succeeded' && data.output) {
        setResultImage(data.output)
        setIsLoading(false)
      } else if (data.id) {
        // Poll for completion
        pollStatus(data.id)
      }
    } catch (err) {
      setIsLoading(false)
      setErrorMsg(err.message || 'Unable to connect to AI server. Please verify your connection.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#1c1b18]/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#faf8f5] border border-[#e8e4dc] shadow-2xl flex flex-col overflow-hidden text-[#1c1b18]">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-[#e8e4dc] flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#5a5e4b]/10 text-[#5a5e4b] flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-serif tracking-[0.15em] uppercase text-[#1c1b18]">
                ZAHZAN AI ATELIER
              </h2>
              <p className="text-[10px] font-sans uppercase tracking-widest text-[#706c64]">
                VIRTUAL TRY-ON STUDIO
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f4f0e8] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {errorMsg && (
            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-sans flex items-start gap-2.5">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-medium block">Virtual Try-On Notice:</span>
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          {!resultImage && !isLoading ? (
            /* CONFIGURATION VIEW */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* LEFT: SELECTED GARMENT PREVIEW */}
              <div className="md:col-span-5 flex flex-col space-y-4">
                <div className="border border-[#e8e4dc] bg-white p-3 space-y-3">
                  <span className="text-[10px] font-sans uppercase tracking-[0.2em] text-[#5a5e4b] block">
                    SELECTED GARMENT
                  </span>
                  
                  <div className="aspect-[3/4] bg-[#f4f0e8] overflow-hidden border border-[#e8e4dc] relative">
                    <img
                      src={garmentImage}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div>
                    <h3 className="text-xs font-serif tracking-wide uppercase line-clamp-1">
                      {product.name}
                    </h3>
                    <p className="text-xs font-sans text-[#706c64] mt-0.5">
                      PKR {product.price?.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* GARMENT FIT CATEGORY */}
                <div className="border border-[#e8e4dc] bg-white p-3 space-y-2">
                  <label className="text-[10px] font-sans uppercase tracking-[0.2em] text-[#706c64] block">
                    GARMENT TYPE
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'dresses', label: 'Full Suit / Dress' },
                      { id: 'tops', label: 'Kurti / Top' },
                      { id: 'bottoms', label: 'Trouser' }
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`py-2 px-1 text-[10px] font-sans uppercase tracking-wider text-center border transition-all cursor-pointer ${
                          category === cat.id
                            ? 'border-[#1c1b18] bg-[#1c1b18] text-white font-medium'
                            : 'border-[#e8e4dc] bg-white text-[#706c64] hover:border-[#1c1b18]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: PERSON IMAGE SELECTION */}
              <div className="md:col-span-7 flex flex-col space-y-4">
                <div className="border border-[#e8e4dc] bg-white p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-sans uppercase tracking-[0.2em] text-[#5a5e4b]">
                      STEP 1: CHOOSE MODEL OR UPLOAD PHOTO
                    </span>
                    <div className="flex gap-2 text-xs font-sans">
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoSource('preset')}
                        className={`px-3 py-1 text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                          selectedPhotoSource === 'preset'
                            ? 'bg-[#1c1b18] text-white'
                            : 'bg-[#f4f0e8] text-[#706c64] hover:text-[#1c1b18]'
                        }`}
                      >
                        Preset Models
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoSource('upload')}
                        className={`px-3 py-1 text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                          selectedPhotoSource === 'upload'
                            ? 'bg-[#1c1b18] text-white'
                            : 'bg-[#f4f0e8] text-[#706c64] hover:text-[#1c1b18]'
                        }`}
                      >
                        Upload Photo
                      </button>
                    </div>
                  </div>

                  {selectedPhotoSource === 'preset' ? (
                    /* PRESET MODELS SELECTION */
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        {PRESET_MODELS.map((model) => (
                          <div
                            key={model.id}
                            onClick={() => setSelectedPreset(model.url)}
                            className={`group relative aspect-[3/4] overflow-hidden border-2 cursor-pointer transition-all ${
                              selectedPreset === model.url
                                ? 'border-[#1c1b18] shadow-md'
                                : 'border-[#e8e4dc] opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={model.url}
                              alt={model.name}
                              className="w-full h-full object-cover"
                            />
                            {selectedPreset === model.url && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-[#1c1b18] text-white rounded-full flex items-center justify-center">
                                <CheckCircle size={12} />
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-center">
                              <span className="text-[9px] font-sans text-white uppercase tracking-wider block">
                                {model.name}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] font-sans text-[#706c64] flex items-center gap-1">
                        <Info size={12} /> Use ready models for instant trial without taking photos.
                      </p>
                    </div>
                  ) : (
                    /* UPLOAD OWN PHOTO */
                    <div className="space-y-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />

                      {userUploadedPhoto ? (
                        <div className="relative aspect-[3/4] max-w-[240px] mx-auto border border-[#e8e4dc] overflow-hidden group">
                          <img
                            src={userUploadedPhoto}
                            alt="Uploaded photo"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 text-xs transition-opacity cursor-pointer"
                          >
                            <RefreshCw size={18} />
                            <span>Change Photo</span>
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-[#e8e4dc] hover:border-[#1c1b18] bg-[#faf8f5] p-8 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
                        >
                          <div className="w-12 h-12 rounded-full bg-[#f4f0e8] flex items-center justify-center text-[#5a5e4b]">
                            <Upload size={22} />
                          </div>
                          <span className="text-xs font-sans font-medium text-[#1c1b18]">
                            Click to upload your full-body or half-body photo
                          </span>
                          <span className="text-[10px] font-sans text-[#706c64]">
                            Supports JPG, PNG, WebP (Max 8MB)
                          </span>
                        </div>
                      )}

                      <div className="bg-[#f4f0e8]/50 p-2.5 border border-[#e8e4dc] text-[10px] font-sans text-[#706c64] space-y-1">
                        <span className="font-medium text-[#1c1b18] block">Tips for Best Results:</span>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>Stand upright with arms slightly away from the torso</li>
                          <li>Plain or uncluttered background with good lighting</li>
                          <li>Avoid oversized outerwear or baggy clothing</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* ACTION BUTTON */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleGenerateTryOn}
                      className="w-full min-h-[48px] py-3 px-4 bg-[#1c1b18] text-[#faf8f5] text-xs font-sans font-medium uppercase tracking-[0.25em] hover:bg-[#5a5e4b] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Sparkles size={16} />
                      <span>GENERATE VIRTUAL TRY-ON</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          ) : isLoading ? (
            /* PROCESSING / LOADING STATE */
            <div className="py-14 text-center max-w-md mx-auto space-y-6">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-[#e8e4dc] animate-ping opacity-30"></div>
                <div className="w-full h-full rounded-full border-2 border-[#5a5e4b] border-t-transparent animate-spin flex items-center justify-center">
                  <Sparkles size={24} className="text-[#5a5e4b]" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-serif uppercase tracking-[0.2em] text-[#1c1b18]">
                  CRAFTING YOUR OUTFIT FIT...
                </h3>
                <p className="text-xs font-sans text-[#706c64] font-light">
                  Our neural network is mapping fabric texture, folds, and seam lines.
                </p>
              </div>

              {/* STEP PROGRESS */}
              <div className="space-y-2 text-left bg-white p-4 border border-[#e8e4dc] text-xs font-sans">
                {[
                  'Aligning body posture and lighting...',
                  'Analyzing Pakistani fabric embroidery & cuts...',
                  'Warping and fitting garment seamlessly...',
                  'Finalizing ultra-high definition render...'
                ].map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 text-xs transition-colors ${
                      idx <= loadingStep ? 'text-[#1c1b18] font-medium' : 'text-[#706c64]/40'
                    }`}
                  >
                    {idx < loadingStep ? (
                      <CheckCircle size={14} className="text-green-600" />
                    ) : idx === loadingStep ? (
                      <RefreshCw size={14} className="animate-spin text-[#5a5e4b]" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-gray-300" />
                    )}
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* RESULT / COMPLETED STATE */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 border border-[#e8e4dc]">
                <div>
                  <span className="text-[10px] font-sans uppercase tracking-[0.2em] text-green-700 font-medium block">
                    ✓ TRY-ON COMPLETE
                  </span>
                  <h3 className="text-xs font-serif uppercase tracking-wider text-[#1c1b18]">
                    {product.name} on Model
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setResultImage(null)}
                    className="px-3 py-1.5 border border-[#e8e4dc] text-xs font-sans text-[#706c64] hover:text-[#1c1b18] hover:border-[#1c1b18] transition-colors cursor-pointer"
                  >
                    Try Another Photo
                  </button>
                  <a
                    href={resultImage}
                    target="_blank"
                    rel="noreferrer"
                    download="zahzan-tryon.jpg"
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#f4f0e8] text-xs font-sans text-[#1c1b18] hover:bg-[#e8e4dc] transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </a>
                </div>
              </div>

              {/* DISPLAY RESULT IMAGE */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-7 flex justify-center">
                  <div className="relative aspect-[3/4] max-h-[500px] bg-[#f4f0e8] border border-[#e8e4dc] shadow-md overflow-hidden">
                    <img
                      src={resultImage}
                      alt="Virtual Try-On Result"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* RIGHT SIDE DETAILS & DIRECT ADD TO BAG */}
                <div className="md:col-span-5 space-y-4 bg-white p-5 border border-[#e8e4dc]">
                  <span className="text-[10px] font-sans uppercase tracking-[0.25em] text-[#5a5e4b] block">
                    PERFECT FIT PREVIEW
                  </span>

                  <div>
                    <h4 className="text-sm font-serif tracking-wider uppercase text-[#1c1b18]">
                      {product.name}
                    </h4>
                    <p className="text-xs font-sans text-[#706c64] mt-1">
                      PKR {product.price?.toLocaleString()}
                    </p>
                  </div>

                  <p className="text-xs font-sans text-[#706c64] font-light leading-relaxed">
                    Satisfied with your virtual look? You can add this outfit directly to your shopping bag.
                  </p>

                  <div className="pt-3 border-t border-[#e8e4dc] space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onAddToCart) onAddToCart()
                        onClose()
                      }}
                      className="w-full min-h-[46px] py-3 px-4 bg-[#1c1b18] text-[#faf8f5] text-xs font-sans font-medium uppercase tracking-[0.25em] hover:bg-[#5a5e4b] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShoppingBag size={14} />
                      <span>ADD OUTFIT TO BAG</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 border-t border-[#e8e4dc] bg-[#faf8f5] flex items-center justify-between text-[10px] font-sans text-[#706c64]">
          <span>POWERED BY ZAHZAN NEURAL ATELIER</span>
          <span>AUTONOMOUS TRY-ON ENGINE</span>
        </div>

      </div>
    </div>
  )
}
