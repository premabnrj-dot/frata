#!/usr/bin/env node
// =============================================================================
// FILE: scripts/themes/make-samples.mjs — `node scripts/themes/make-samples.mjs`
//
// Draws the customizer's sample photos (plan 2026-11-09-themes-three, task 5): illustrated garments, a detail of
// each fabric, and two scene photos for heroes, painted on a canvas in Chromium and saved as WebP at the shop's
// size ladder names (<name>-400.webp, -800.webp; scenes also -1600) under public/themes/samples/. Drawn, not
// photographed: no model, no licence, nothing that could pass for a real product. Served from the console host
// only (shop hosts are rewritten to /s/…), so a sample can never appear on a shop. Rerun after changing a piece in
// src/lib/themes/sample.ts; the names here and there must match (sample.test.ts checks every file exists).
// =============================================================================
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'public/themes/samples'
mkdirSync(OUT, { recursive: true })
export const PIECES = [
  { name: 'haldi-kurta', shape: 'kurta', base: '#E9B23C', ink: '#8A4B12', motif: 'booti', bg: ['#F6EBD5', '#EAD8B6'] },
  { name: 'indigo-dabu', shape: 'kurta', base: '#2F3E73', ink: '#C9D3EE', motif: 'dots', bg: ['#E9ECF5', '#D3D9EA'] },
  { name: 'rani-anarkali', shape: 'anarkali', base: '#B8285E', ink: '#F2C14E', motif: 'border', bg: ['#F7E4EA', '#EFCCD7'] },
  { name: 'ivory-chikan', shape: 'kurta', base: '#F4EEE2', ink: '#B9AE98', motif: 'chikan', bg: ['#E8E2D6', '#D9D1C2'] },
  { name: 'mehndi-saree', shape: 'saree', base: '#5E7A3A', ink: '#E7C873', motif: 'border', bg: ['#EEF1E4', '#DCE3CB'] },
  { name: 'terracotta-coord', shape: 'coord', base: '#B4573A', ink: '#F3D9C8', motif: 'stripes', bg: ['#F5E6DE', '#EBD2C5'] },
  { name: 'black-linen-shirt', shape: 'shirt', base: '#222222', ink: '#444444', motif: 'plain', bg: ['#EDEDEA', '#DCDCD7'] },
  { name: 'sky-maxi', shape: 'dress', base: '#8DB4D9', ink: '#F4F8FC', motif: 'dots', bg: ['#EAF1F7', '#D5E3EF'] },
]
export const SCENES = [
  { name: 'scene-festive', a: '#F3D9A4', b: '#C9792B', ink: '#5A2E0E' },
  { name: 'scene-studio', a: '#E7E5E0', b: '#9A9893', ink: '#1F1F1F' },
]

const draw = String.raw`
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.round(Math.min(255, Math.max(0, r * f))); g = Math.round(Math.min(255, Math.max(0, g * f))); b = Math.round(Math.min(255, Math.max(0, b * f))); return 'rgb(' + r + ',' + g + ',' + b + ')' }
function pattern(ctx, p, s) {
  const c = document.createElement('canvas'); const t = Math.round(40 * s); c.width = c.height = t; const x = c.getContext('2d')
  x.fillStyle = p.base; x.fillRect(0, 0, t, t); x.fillStyle = p.ink; x.strokeStyle = p.ink; x.lineWidth = Math.max(1, 1.6 * s)
  if (p.motif === 'dots') { x.beginPath(); x.arc(t / 4, t / 4, 2.6 * s, 0, 7); x.arc(3 * t / 4, 3 * t / 4, 2.6 * s, 0, 7); x.fill() }
  if (p.motif === 'booti') { for (const [cx, cy] of [[t / 4, t / 4], [3 * t / 4, 3 * t / 4]]) { for (let k = 0; k < 5; k++) { const a = k * 1.2566; x.beginPath(); x.ellipse(cx + Math.cos(a) * 3.2 * s, cy + Math.sin(a) * 3.2 * s, 2.4 * s, 1.3 * s, a, 0, 7); x.fill() } } }
  if (p.motif === 'chikan') { x.globalAlpha = .7; for (const [cx, cy] of [[t / 2, t / 2]]) { x.beginPath(); for (let k = 0; k < 6; k++) { const a = k * 1.047; x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * 7 * s, cy + Math.sin(a) * 7 * s) } x.stroke(); x.beginPath(); x.arc(cx, cy, 2 * s, 0, 7); x.fill() } }
  if (p.motif === 'stripes') { x.globalAlpha = .55; for (let i = 0; i < t; i += 10 * s) x.fillRect(i, 0, 2.5 * s, t) }
  if (p.motif === 'border') { x.globalAlpha = .45; x.beginPath(); x.arc(t / 2, t / 2, 3 * s, 0, 7); x.fill() }
  return ctx.createPattern(c, 'repeat')
}
function silhouette(ctx, shape, W, H) {
  const cx = W / 2, top = H * 0.16, u = W / 100
  ctx.beginPath()
  if (shape === 'kurta' || shape === 'shirt') {
    const len = shape === 'shirt' ? 0.5 : 0.66
    ctx.moveTo(cx - 9 * u, top); ctx.quadraticCurveTo(cx, top + 6 * u, cx + 9 * u, top)
    ctx.lineTo(cx + 22 * u, top + 5 * u); ctx.lineTo(cx + 34 * u, top + 30 * u); ctx.lineTo(cx + 26 * u, top + 34 * u); ctx.lineTo(cx + 20 * u, top + 20 * u)
    ctx.lineTo(cx + 21 * u, top + H * len); ctx.lineTo(cx - 21 * u, top + H * len); ctx.lineTo(cx - 20 * u, top + 20 * u)
    ctx.lineTo(cx - 26 * u, top + 34 * u); ctx.lineTo(cx - 34 * u, top + 30 * u); ctx.lineTo(cx - 22 * u, top + 5 * u); ctx.closePath()
  } else if (shape === 'anarkali' || shape === 'dress') {
    const flare = shape === 'anarkali' ? 40 : 30
    ctx.moveTo(cx - 9 * u, top); ctx.quadraticCurveTo(cx, top + 6 * u, cx + 9 * u, top); ctx.lineTo(cx + 18 * u, top + 4 * u)
    ctx.lineTo(cx + 15 * u, top + 26 * u); ctx.quadraticCurveTo(cx + flare * u, top + H * 0.5, cx + flare * u, top + H * 0.68)
    ctx.quadraticCurveTo(cx, top + H * 0.72, cx - flare * u, top + H * 0.68); ctx.quadraticCurveTo(cx - flare * u, top + H * 0.5, cx - 15 * u, top + 26 * u)
    ctx.lineTo(cx - 18 * u, top + 4 * u); ctx.closePath()
  } else if (shape === 'saree') {
    ctx.moveTo(cx - 14 * u, top + 2 * u); ctx.quadraticCurveTo(cx + 4 * u, top - 2 * u, cx + 16 * u, top + 4 * u)
    ctx.lineTo(cx + 28 * u, top + H * 0.38); ctx.quadraticCurveTo(cx + 30 * u, top + H * 0.6, cx + 24 * u, top + H * 0.7)
    ctx.lineTo(cx - 26 * u, top + H * 0.7); ctx.quadraticCurveTo(cx - 30 * u, top + H * 0.5, cx - 20 * u, top + 24 * u); ctx.closePath()
  } else if (shape === 'coord') {
    ctx.moveTo(cx - 9 * u, top); ctx.quadraticCurveTo(cx, top + 5 * u, cx + 9 * u, top); ctx.lineTo(cx + 22 * u, top + 5 * u); ctx.lineTo(cx + 28 * u, top + 22 * u)
    ctx.lineTo(cx + 20 * u, top + 24 * u); ctx.lineTo(cx + 19 * u, top + H * 0.3); ctx.lineTo(cx - 19 * u, top + H * 0.3); ctx.lineTo(cx - 20 * u, top + 24 * u); ctx.lineTo(cx - 28 * u, top + 22 * u); ctx.lineTo(cx - 22 * u, top + 5 * u); ctx.closePath()
    ctx.moveTo(cx - 18 * u, top + H * 0.32); ctx.lineTo(cx + 18 * u, top + H * 0.32); ctx.lineTo(cx + 22 * u, top + H * 0.7); ctx.lineTo(cx + 3 * u, top + H * 0.7); ctx.lineTo(cx, top + H * 0.42); ctx.lineTo(cx - 3 * u, top + H * 0.7); ctx.lineTo(cx - 22 * u, top + H * 0.7); ctx.closePath()
  }
}
function piece(p, W, H, view) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); const s = W / 400
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, view === 1 ? p.bg[1] : p.bg[0]); g.addColorStop(1, view === 1 ? p.bg[0] : p.bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  if (view === 2) { ctx.fillStyle = pattern(ctx, p, s * 2.2); ctx.fillRect(0, 0, W, H); for (let i = 0; i < 7; i++) { const y = H * (0.1 + i * 0.13); const fg = ctx.createLinearGradient(0, y - 30 * s, 0, y + 30 * s); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(.5, 'rgba(0,0,0,.14)'); fg.addColorStop(1, 'rgba(255,255,255,.06)'); ctx.fillStyle = fg; ctx.fillRect(0, y - 30 * s, W, 60 * s) } return c }
  ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.9, W * 0.3, H * 0.025, 0, 0, 7); ctx.fill()
  ctx.strokeStyle = shade(p.bg[1], .7); ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(W * .5, H * .06); ctx.lineTo(W * .5, H * .12); ctx.moveTo(W * .36, H * .16); ctx.quadraticCurveTo(W * .5, H * .08, W * .64, H * .16); ctx.stroke()
  ctx.save(); if (view === 1) { ctx.translate(W, 0); ctx.scale(-1, 1) }
  silhouette(ctx, p.shape, W, H); ctx.fillStyle = pattern(ctx, p, s); ctx.fill()
  const sh = ctx.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(0,0,0,.18)'); sh.addColorStop(.45, 'rgba(255,255,255,.06)'); sh.addColorStop(1, 'rgba(0,0,0,.22)'); ctx.fillStyle = sh; ctx.fill()
  if (p.motif === 'border') { ctx.save(); ctx.clip(); ctx.fillStyle = p.ink; ctx.fillRect(0, H * 0.8, W, H * 0.05); ctx.restore() }
  ctx.restore(); return c
}
function scene(sc, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, sc.a); g.addColorStop(1, sc.b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,255,255,.18)'; const aw = W * .3, ax = W * .62, ay = H * .12; ctx.beginPath(); ctx.moveTo(ax, H); ctx.lineTo(ax, ay + aw / 2); ctx.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0); ctx.lineTo(ax + aw, H); ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, H * .82, W, H * .18)
  ctx.globalAlpha = .9; ctx.fillStyle = sc.ink; for (let i = 0; i < 3; i++) { const x = W * (.66 + i * .07), y = H * .3; ctx.beginPath(); ctx.moveTo(x - W * .03, y); ctx.lineTo(x + W * .03, y); ctx.lineTo(x + W * .04, y + H * .45); ctx.lineTo(x - W * .04, y + H * .45); ctx.closePath(); ctx.globalAlpha = .25 + i * .2; ctx.fill() }
  return c
}
window.render = (kind, item, W, H, view) => (kind === 'scene' ? scene(item, W, H) : piece(item, W, H, view)).toDataURL('image/webp', 0.8)
`
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(`<script>${draw}</script>`)
let bytes = 0
const save = async (file, kind, item, W, H, view = 0) => {
  const url = await page.evaluate(([k, i, w, h, v]) => window.render(k, i, w, h, v), [kind, item, W, H, view])
  const buf = Buffer.from(url.split(',')[1], 'base64'); bytes += buf.length
  writeFileSync(`${OUT}/${file}`, buf)
}
for (const p of PIECES) for (const [view, tag] of [[0, ''], [1, '-b'], [2, '-d']]) for (const w of [400, 800]) await save(`${p.name}${tag}-${w}.webp`, 'piece', p, w, w * 1.25, view)
for (const sc of SCENES) for (const w of [800, 1600]) await save(`${sc.name}-${w}.webp`, 'scene', sc, w, Math.round(w * 0.625))
await browser.close()
console.log(`make-samples: ${PIECES.length * 6 + SCENES.length * 2} files, ${Math.round(bytes / 1024)} kB in ${OUT}`)
