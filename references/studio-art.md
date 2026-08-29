# Router Studio art system

Router Studio uses original image-generation output created specifically for this repository. No third-party character, game, logo, or proprietary interface asset is included.

## Locked art bible

The production target is a polished 2D Japanese anime-inspired chibi office-management game:

- approximately 2.8–3 heads tall;
- large expressive anime eyes and simplified facial features;
- thin-to-medium clean line art and soft cel shading;
- bright white office architecture, large windows, pale wood desks, plants, books, coffee, and small personal objects;
- pastel white, pale blue, mint, lavender, cream, and light-wood palette;
- slightly elevated front three-quarter workstation camera;
- no text, letters, numbers, logos, watermarks, speech bubbles, model names, status words, or baked UI.

The first approved image was Spark in `WORKING`. Every later worker used that exact output as the primary style reference, with the Router Studio product reference used only for office-simulation mood and visual density.

## Master Spark prompt

```text
Use case: stylized-concept
Asset type: master style test for one Router Studio workstation card
Input image: style reference only. Match its anime/chibi character proportions, bright pastel office-simulation feeling, camera angle, clean line art, compact workstation scale, and soft daylight. Do not copy its UI, characters, logos, labels, or text.
Primary request: Spark — WORKING. Create one original cute chibi female AI engineer actively coding at her desk.
Scene/backdrop: bright white modern anime office, large daylight window, light wood desk, white shelves and cabinets, small indoor plants, books, a coffee cup, and two or three tiny tasteful desk decorations.
Subject: warm brown hair with clean anime hair shapes; large expressive anime eyes; simplified nose and mouth; modern mint/cyan headphones; compact hands and feet; approximately 2.8 to 3 heads tall; small body and clearly oversized chibi head. She is seated and actively typing quickly, focused but cheerful, energetic and fast. Include a tiny original desk mascot with no markings.
Workstation: dual modern monitors showing only abstract colorful rectangular code lines and geometric shapes—absolutely no letters, words, numbers, pseudo-text, or UI labels.
Style/medium: polished 2D Japanese anime-inspired chibi simulation-game illustration, clean thin-to-medium anime line art, smooth curves, controlled detail, soft cel shading, pastel finish, cute but professional. The result must look like a scene from one cohesive 2D office management game, not an illustration for a corporate website.
Composition/framing: 16:10-ish landscape workstation scene, slightly elevated front three-quarter view, character and desk clearly visible, compact environment, balanced for cropping into a web card.
Lighting/mood: bright morning office with soft diffuse daylight, cheerful and calm.
Color palette: bright white, pale blue, mint/cyan accents, warm cream, light wood, small coral details.
Technical requirements: one character only; no text; no letters; no numbers; no logos; no watermarks; no speech bubbles; no model name; no status words; no baked-in interface; no copyrighted character; no cropped head; no realistic adult anatomy.
Avoid: realistic or semi-realistic body proportions, Western editorial illustration, corporate SaaS art, stock office art, painterly rendering, photography, 3D, cinematic lighting, neon cyberpunk, dark green palette, giant realistic desk, clutter, gibberish screens.
```

The other role prompts preserved the locked art bible and changed only identity and pose:

| Asset | Identity / state direction |
|---|---|
| `parent/parent-planning.webp` | Dark-haired mature coordinator, indigo accents, dual monitors, planning diagrams. |
| `spark/spark-working.webp` | Brown-haired energetic coder, mint headphones, active typing, desk mascot. |
| `terra/terra-working.webp` | Warm brown-haired steady generalist, blue accents, balanced normal workstation. |
| `luna/luna-thinking.webp` | Lavender-haired debugger, multiple monitors, thinking pose, coffee. |
| `gpt55/gpt55-idle.webp` | Silver-haired calm standby specialist, navy/pink accents, laptop and dim monitor. |
| `sol/sol-verifying.webp` | Dark-haired senior reviewer, glasses, deep blue accents, architecture diagram. |

## Production treatment

The built-in image-generation tool produced the source images. Approved outputs were aspect-aware center-cropped, resized to `960×600`, and encoded as WebP at quality 84. Each final file is under 100 KB.

The UI uses one coherent base illustration per worker and applies runtime-controlled overlays for `WORKING`, `THINKING`, `WAITING`, `IDLE`, `VERIFYING`, `BLOCKED`, and `DONE`. Status words are never baked into the image.

## Validation checklist

Every production asset was inspected for:

- matching head/body ratio, eye style, line weight, rendering, lighting, architecture, desk scale, and camera;
- complete character and workstation framing at card size;
- no realistic/corporate art direction;
- no generated text, UI labels, trademarks, copied characters, or watermarks;
- no black padding or crop artifacts;
- consistent `960×600` dimensions and web-friendly file size.
