# XAI brand kit

**Name:** XAI. **Tagline:** Your private AI, on your own PC.
**Credit line:** Developed by Datix AI (small, muted, at the bottom of screens and materials).

## Logo
- `xai-icon.svg`: app icon. Rounded square with the brand gradient and a white four-point spark that forms an X (the spark stands for intelligence, the X for XAI). PNG: 256, 512, 1024.
- `xai-mark.svg`: the spark alone in the gradient. Use as the AI avatar and on dark backgrounds.
- `xai-wordmark.svg` / `.png`: icon plus the XAI wordmark and tagline.
- `xai-banner.png`: 1600 x 900 promo banner.
- Keep clear space of at least half the icon height around the logo. Do not recolour, stretch or add effects.

## Colours
| Role | Hex |
|---|---|
| Indigo (gradient start) | #4F46E5 |
| Violet (gradient middle) | #7C3AED |
| Cyan (gradient end) | #06B6D4 |
| Dark background | #1D1E21 / sidebar #17181B |
| Light background | #FAF9F7 / sidebar #F4F3F0 |
| Accent in UI (light / dark) | #5048E5 / #8D8BFF |

Gradient: 135 degrees, indigo 0%, violet 55%, cyan 100%.

## Type
- UI: Segoe UI Variable (Windows system font).
- Greetings and page titles: Palatino Linotype / Georgia serif, regular weight.
- Wordmark: Segoe UI, extra bold, wide letter spacing.
- Code: Cascadia Code.

## Rebuild assets
```
npx electron tools/render-brand.js
.venv\Scripts\python.exe -I tools\make_ico.py
```
