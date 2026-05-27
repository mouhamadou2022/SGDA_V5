// components/ui/StyletCanvas.tsx — SGDA V5
// Canvas HTML5 pour saisie au stylet/doigt — checklist tactile.
// ✅ R1 : 0 style inline (canvas dimensions via props/CSS)
'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Pen, Highlighter, Eraser, Trash2, Download } from 'lucide-react'
import { Button } from './button'
import type { CanvasPoint, CanvasStroke } from '@/lib/stylet'
import { strokestoDataURL } from '@/lib/stylet'

interface StyletCanvasProps {
  width?: number
  height?: number
  onSave?: (dataUrl: string, strokes: CanvasStroke[]) => void
  initialStrokes?: CanvasStroke[]
  readOnly?: boolean
  className?: string
}

type Tool = 'pen' | 'highlighter' | 'eraser'

const TOOL_COLORS: Record<Tool, string> = {
  pen: '#1e293b',
  highlighter: '#facc15',
  eraser: '#ffffff',
}

const TOOL_WIDTHS: Record<Tool, number> = {
  pen: 2,
  highlighter: 12,
  eraser: 20,
}

export function StyletCanvas({
  width = 800,
  height = 400,
  onSave,
  initialStrokes = [],
  readOnly = false,
  className,
}: StyletCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [strokes, setStrokes] = useState<CanvasStroke[]>(initialStrokes)
  const [currentStroke, setCurrentStroke] = useState<CanvasPoint[]>([])
  const [activeTool, setActiveTool] = useState<Tool>('pen')
  const [isDrawing, setIsDrawing] = useState(false)

  const redraw = useCallback((strokeList: CanvasStroke[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    strokeList.forEach((stroke) => {
      if (stroke.points.length < 2) return
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.4 : 1
      if (stroke.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    })
  }, [])

  useEffect(() => {
    redraw(strokes)
  }, [strokes, redraw])

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pressure,
      timestamp: Date.now(),
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDrawing(true)
    setCurrentStroke([getPoint(e)])
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return
    const newPoint = getPoint(e)
    const updated = [...currentStroke, newPoint]
    setCurrentStroke(updated)

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || updated.length < 2) return

    const prev = updated[updated.length - 2]
    ctx.beginPath()
    ctx.strokeStyle = TOOL_COLORS[activeTool]
    ctx.lineWidth = TOOL_WIDTHS[activeTool]
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = activeTool === 'highlighter' ? 0.4 : 1
    if (activeTool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(newPoint.x, newPoint.y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  const handlePointerUp = () => {
    if (!isDrawing || readOnly) return
    setIsDrawing(false)

    if (currentStroke.length > 0) {
      const newStroke: CanvasStroke = {
        points: currentStroke,
        color: TOOL_COLORS[activeTool],
        width: TOOL_WIDTHS[activeTool],
        tool: activeTool,
      }
      setStrokes((prev) => [...prev, newStroke])
    }
    setCurrentStroke([])
  }

  const handleClear = () => {
    setStrokes([])
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  const handleSave = () => {
    const dataUrl = strokestoDataURL(strokes, width, height)
    onSave?.(dataUrl, strokes)
  }

  const handleDownload = () => {
    const dataUrl = strokestoDataURL(strokes, width, height)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `sgda_annotation_${Date.now()}.png`
    a.click()
  }

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'pen', icon: <Pen className="w-4 h-4" />, label: 'Stylet' },
    { id: 'highlighter', icon: <Highlighter className="w-4 h-4" />, label: 'Surligneur' },
    { id: 'eraser', icon: <Eraser className="w-4 h-4" />, label: 'Gomme' },
  ]

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          {tools.map((t) => (
            <Button
              key={t.id}
              variant={activeTool === t.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTool(t.id)}
              aria-label={t.label}
              title={t.label}
            >
              {t.icon}
              <span className="ml-1 hidden sm:inline text-xs">{t.label}</span>
            </Button>
          ))}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={handleClear} title="Effacer tout">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownload} title="Télécharger">
            <Download className="w-4 h-4" />
          </Button>
          {onSave && (
            <Button size="sm" onClick={handleSave}>
              Enregistrer
            </Button>
          )}
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`border rounded-xl touch-none bg-white w-full ${activeTool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  )
}
