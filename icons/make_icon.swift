// Genera la icona de la Midnight web app a partir del logo de la Midnight Suite.
// Ús: swift make_icon.swift <icon_1024 de la Suite> <sortida.png>
import AppKit
import CoreGraphics

let args = CommandLine.arguments
let src = NSImage(contentsOfFile: args[1])!
var rect = CGRect(x: 0, y: 0, width: 1024, height: 1024)
let srcCG = src.cgImage(forProposedRect: &rect, context: nil, hints: nil)!

let S = 1024
let cs = CGColorSpaceCreateDeviceRGB()

// 1. Màscara del logo (ocell + MIDNIGHT): píxels blancs de la icona original
let crop = CGRect(x: 240, y: 340, width: 545, height: 215)   // coordenades d'imatge (origen a dalt)
let lw = Int(crop.width), lh = Int(crop.height)
var px = [UInt8](repeating: 0, count: lw * lh * 4)
let readCtx = CGContext(data: &px, width: lw, height: lh, bitsPerComponent: 8, bytesPerRow: lw * 4,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
readCtx.draw(srcCG.cropping(to: crop)!, in: CGRect(x: 0, y: 0, width: lw, height: lh))
var mask = [UInt8](repeating: 0, count: lw * lh * 4)
for i in 0..<(lw * lh) {
  let m = Double(min(px[i*4], px[i*4+1], px[i*4+2])) / 255
  let a = max(0, min(1, (m - 0.45) / 0.35))
  let v = UInt8(a * 255)
  mask[i*4] = v; mask[i*4+1] = v; mask[i*4+2] = v; mask[i*4+3] = v   // blanc premultiplicat
}
let maskCtx = CGContext(data: &mask, width: lw, height: lh, bitsPerComponent: 8, bytesPerRow: lw * 4,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let logo = maskCtx.makeImage()!

// 2. Fons: negre verdós amb llums verdes difuminades (com el degradat de la Suite, però en neó)
let ctx = CGContext(data: nil, width: S, height: S, bitsPerComponent: 8, bytesPerRow: 0,
                    space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 0.012, green: 0.03, blue: 0.012, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: S, height: S))
func glow(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ c: (CGFloat, CGFloat, CGFloat), _ a: CGFloat) {
  let g = CGGradient(colorsSpace: cs, colors: [CGColor(red: c.0, green: c.1, blue: c.2, alpha: a),
                                               CGColor(red: c.0, green: c.1, blue: c.2, alpha: 0)] as CFArray,
                     locations: [0, 1])!
  ctx.drawRadialGradient(g, startCenter: CGPoint(x: x, y: y), startRadius: 0,
                         endCenter: CGPoint(x: x, y: y), endRadius: r, options: [])
}
// (origen a baix a l'esquerra)
glow(700, 860, 560, (0.24, 1.0, 0.17), 0.55)   // dalt a la dreta
glow(260, 300, 520, (0.05, 0.45, 0.05), 0.65)  // baix a l'esquerra
glow(520, 520, 380, (0.10, 0.35, 0.08), 0.35)  // centre

// 3. Logo en blanc, centrat a dalt, amb una mica de resplendor
let scale: CGFloat = 1.32
let dw = CGFloat(lw) * scale, dh = CGFloat(lh) * scale
let logoRect = CGRect(x: (CGFloat(S) - dw) / 2, y: 470, width: dw, height: dh)
ctx.setShadow(offset: .zero, blur: 28, color: CGColor(red: 0.24, green: 1, blue: 0.17, alpha: 0.55))
ctx.draw(logo, in: logoRect)
ctx.setShadow(offset: .zero, blur: 0, color: nil)

// 4. "APP" espaiat en verd neó, com "SUITE"
let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
NSGraphicsContext.current = ns
let font = NSFont.systemFont(ofSize: 150, weight: .heavy)
let shadow = NSShadow()
shadow.shadowColor = NSColor(red: 0.24, green: 1, blue: 0.17, alpha: 0.7)
shadow.shadowBlurRadius = 30
let attrs: [NSAttributedString.Key: Any] = [
  .font: font, .kern: 34,
  .foregroundColor: NSColor(red: 0.24, green: 1.0, blue: 0.17, alpha: 1),
  .shadow: shadow,
]
let text = NSAttributedString(string: "APP", attributes: attrs)
let tsz = text.size()
text.draw(at: CGPoint(x: (CGFloat(S) - tsz.width + 34) / 2, y: 250))
NSGraphicsContext.current = nil

let out = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: out)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("ok", args[2])
