# Foil recipes, as the publisher's own viewer draws them

Captured from cards.disneylorcana.com. Kept verbatim so the port can be
checked against it rather than re-derived by eye — which is how the first
attempt went wrong.

## The driving contract

Four custom properties on the card container, and nothing else:

```
--colorX, --colorY   pointer position as a percentage; 50% 50% at rest
--combined           colorX + colorY; 100% at rest
--rotateX, --rotateY the lean, in degrees
--opacity            glare strength; 0 at rest
```

The container is `perspective(900px)`, `isolation: isolate`,
`contain: layout paint`, aspect-ratio .72.

The foil layer is masked with the published JPEG through an SVG mask in
**luminance** mode (`mask: url(#foilMask) 0 0/cover no-repeat luminance`),
not by multiplying it — which is what makes the no-alpha JPEG usable.

## Per finish

```css























.Silver .foil-shine .foil-inner { background-image:url(/assets/silverc-B7Q2CuyS.jpg),url(/assets/satin-BFAj3gek.jpg);background-repeat:repeat-x,no-repeat;background-size:300% 100%,100% 100%;background-position:var(--colorX) center, center;background-blend-mode:exclusion;mix-blend-mode:hard-light;opacity:.5;filter:brightness(1.6)saturate(.2)invert() }

.CalendarWave .foil-shine .foil-inner { background-image:url(/assets/calc-DEcSJdOB.jpg),url(/assets/calendarwave-ClbJVfyj.jpg),url(/assets/satin-BFAj3gek.jpg);background-repeat:repeat,repeat,repeat;background-size:300% 100%,cover,50% 50%;background-position:calc(var(--combined) * 1.5) center, center, center;background-blend-mode:color-burn, exclusion, normal;mix-blend-mode:multiply;opacity:.4;filter:contrast(2)saturate(1.5) }

.FreeForm1 .foil-shine .foil-inner,.FreeForm2 .foil-shine .foil-inner { background-image:url(/assets/ff2c-CrtsMXCV.jpg),url(/assets/ff2-cqInX_CI.jpg),url(/assets/ff2-cqInX_CI.jpg);background-repeat:repeat,repeat,repeat;background-size:400%,80% 300%,80% 200%;background-position:calc(var(--colorX) / 1.75) calc(var(--colorY) / 1.75), calc(var(--colorX) / 4) calc(-1 * var(--colorY) / 8), calc(-1 * (var(--colorX)) / 1.5) calc(-1 * var(--colorY) / 10);background-blend-mode:color, multiply, normal;mix-blend-mode:multiply;opacity:.5;filter:brightness(.6)contrast(5)saturate(2) }

.Glitter .foil-shine .foil-inner { background-image:url(/assets/glitter-B5ieUr43.jpg),url(/assets/ff2c-CrtsMXCV.jpg),url(/assets/glitter-B5ieUr43.jpg);background-repeat:repeat,repeat,repeat;background-size:12.5% 12.5%,350% 125%,25% 25%;background-position:center, var(--combined) var(--combined), center;background-blend-mode:color-burn, darken, normal;mix-blend-mode:exclusion;opacity:.4;filter:brightness(4)invert() }

.Lava .foil-shine .foil-inner { background-image:url(/assets/lava2-CSqijIl2.jpg),repeating-linear-gradient(65deg,#0004 12.5%,#2b1fdf44 25%,#00a8bf44 37.5%,#36fc3844 50%,#ccc00044 62.5%,#d004 75%,#0004 87.5%);background-repeat:no-repeat,repeat;background-size:cover,300% 300%;background-position:center, calc(var(--combined) / 1.75) center;background-blend-mode:color-burn, soft-light;mix-blend-mode:color-dodge;filter:brightness(.85)contrast(3)saturate(1.5) }

.Lore .foil-shine .foil-inner { background-image:url(/assets/vertwavec-BMylqOpz.jpg),url(/assets/satin-BFAj3gek.jpg);background-repeat:repeat,no-repeat;background-size:250% 100%,cover;background-position:calc(var(--combined) / 2) center, center;background-blend-mode:multiply, normal;mix-blend-mode:exclusion;filter:brightness(.5) }

.Magma .foil-shine .foil-inner { background-image:url(/assets/vertwavec-BMylqOpz.jpg),url(/assets/magma-DpAKLSH0.jpg),url(/assets/magma-DpAKLSH0.jpg);background-repeat:no-repeat,repeat,repeat;background-size:150% 100%,125% 125%,125% 125%;background-position:calc(var(--combined) / 1.5) center, calc(var(--colorX) / 8) calc(var(--colorY) / 10), calc(-1 * var(--colorX) / 10) calc(-1 * var(--colorY) / 8);background-blend-mode:color, difference;mix-blend-mode:hard-light;opacity:.625 }

.Satin .foil-shine .foil-inner { background-image:url(/assets/satinc-_4HVyYlm.png),url(/assets/satin-BFAj3gek.jpg);background-size:175% 100%,cover;background-position:calc(var(--colorX) * 1 + var(--colorY)) center, center;background-blend-mode:normal, multiply;mix-blend-mode:exclusion;filter:brightness(.5) }

.Tempest .foil-shine .foil-inner { background-image:url(/assets/tempest-DdoMolRU.jpg),url(/assets/vertwavec-BMylqOpz.jpg),url("data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20xmlns:xlink='http://www.w3.org/1999/xlink'%20width='500'%20height='500'%3e%3cfilter%20id='n'%3e%3cfeTurbulence%20type='fractalNoise'%20baseFrequency='.7'%20numOctaves='10'%20stitchTiles='stitch'%3e%3c/feTurbulence%3e%3c/filter%3e%3crect%20width='500'%20height='500'%20fill='%23000'%3e%3c/rect%3e%3crect%20width='500'%20height='500'%20filter='url(%23n)'%20opacity='0.3'%3e%3c/rect%3e%3c/svg%3e");background-repeat:no-repeat,repeat,no-repeat;background-size:cover,700% 250%,cover;background-position:center, calc(var(--combined) / 4) center, center;background-blend-mode:color-burn, screen, normal;mix-blend-mode:color-dodge;filter:brightness(.8)contrast(2) }

.VerticalWave .foil-shine .foil-inner { background-image:url(/assets/vertwave-DjQUN9hM.jpg),url(/assets/vertwavec-BMylqOpz.jpg),url(/assets/satin-BFAj3gek.jpg);background-repeat:no-repeat,repeat,no-repeat;background-size:cover,600% 100%,cover;background-position:center, calc(var(--combined) / 3) center, center;background-blend-mode:color-burn, multiply, normal;mix-blend-mode:hard-light;filter:brightness(.75)contrast(.5) }

.SeaWave .foil-shine .foil-inner { background-image:url(data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAABBAAD/4QN/aHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA3LjItYzAwMCA3OS41NjZlYmM1YjQsIDIwMjIvMDUvMDktMDg6MjU6NTUgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6MjBkNTQzZWUtMTU5OS1mMDQxLTk1MWYtYjZiOWZlMTU2OThlIiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOkI0QjVDQUNEQ0M2QTExRjA4OEQ3Q0E4MUNGMjZENDA4IiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOkI0QjVDQUNDQ0M2QTExRjA4OEQ3Q0E4MUNGMjZENDA4IiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCAyNC43IChXaW5kb3dzKSI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjQwMTFiYWQ4LWRmZDgtZTQ0OC1hMGEzLTUyZDEwYmY0YTdhYyIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDoyMGQ1NDNlZS0xNTk5LWYwNDEtOTUxZi1iNmI5ZmUxNTY5OGUiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz7/7gAOQWRvYmUAZMAAAAAB/9sAhAAFBAQEBAQFBAQFBwUEBQcJBwUFBwkKCAgJCAgKDQoLCwsLCg0MDAwNDAwMDw8REQ8PFxYWFhcZGRkZGRkZGRkZAQYGBgoJChQNDRQWEQ4RFhkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRn/wAARCAAQAgADAREAAhEBAxEB/8QAYgABAQEBAQEBAAAAAAAAAAAABAIDAQAFCAEBAAMBAQAAAAAAAAAAAAAAAwECBAAFEAEAAwEBAAMAAAAAAAAAAAAAAQIDQTFRMgQRAQEBAQEBAAAAAAAAAAAAAAABAgMEMf/aAAwDAQACEQMRAD8A/OzVCqS52EuVC0cpaOUtHLheIXC8cuCRDSpIq2oSKtqrxStqkgqRQkDpvUkZ9tsyRk0XmsDRVOODovNANF5oDovNSg0VmpQaMz4Og0ZkDYNG5cZts+jM/WXYNF58ZNh0TRi6B0RVh6Dpn5Ps830fGny/X1s+PF7vb5N48eL6W7m9V41a8NK+q1s5rQ2c3PlzfzZ2WjdzY3XjbzH04SNuBNDZbMBa9NlqwDqbLRkLU+SwLXpsrQHTpsrwHU+UhamykLU+UUDU+VaDofKtC16fKlE0NkdE0LB0W5YOjXLFKPYkHpnKYLSJWg6zlYdTKVKmUqVKVKiUquJQ4UKkudhLlQtHKWjlLRy4XiFwvHLgkQ0qSK1tQkVbVXilbVJBUihIHTepIz7bZ+kjJovNYGiqccHReaAaLzQHRealBorNSg0ZnwegaMyBsGjcuM22fRmfrLsGi8+MnQOiaMXQNIqw9B0z8frzfR8afL9fWz48Xu9vk3jx4vpbub1XjVrw0j1Vs5rQ2c3HN/NndaN3NjdeNvMfThI24E0NlswFr02WrAOpstGQtenyWBamytAdOmyuDqfKQtTZSFqfKANT5VoOh8q0PXp8qUPQ2R0TQsHRblg6NcsUo9iQemcpgtIlaDrOVh1MpUqZSpUpUqJSq4lD/9k=),url(/assets/seawave-BhktEfhE.jpg),url(/assets/satin-BFAj3gek.jpg);background-repeat:repeat,repeat,repeat;background-size:125% 125%,100% 50%,50% 50%;background-position:calc(var(--combined) * 4) center, center, center;background-blend-mode:color-burn, multiply, normal;mix-blend-mode:hard-light;filter:brightness(.5)contrast(.75) }

.RainbowPillars .foil-shine .foil-inner { background-image:url(/assets/pillar-BzMRCuKg.jpg),url(/assets/pillar2-CA6O6Y8x.jpg),url(/assets/color-CDWTHKfk.jpg);background-repeat:repeat,repeat,repeat;background-size:150% 150%,140% 150%,90% 90%;background-position:calc(var(--combined) / 2) bottom, calc(var(--combined) / 4) top, calc(var(--combined) / 2) center;background-blend-mode:color-dodge, darken, normal;mix-blend-mode:hard-light;opacity:.25;filter:brightness(.75)contrast(5)saturate(4) }

.satin-shine .foil-inner { background-image:linear-gradient(60deg,#0000 60%,#fffc 70%,#0000 80%);background-repeat:no-repeat;background-size:300% 100%;background-position:var(--combined) center;mix-blend-mode:hard-light }

.lore-shine .foil-inner { background-image:url(/assets/lore-BIrmTlM4.jpg),url(/assets/vertwavec-BMylqOpz.jpg);background-repeat:no-repeat,repeat;background-size:cover,150% 150%;background-position:center, calc(var(--colorX) * 2 + var(--colorY)) center;background-blend-mode:exclusion, normal;mix-blend-mode:darken;opacity:.6;filter:brightness(.75)contrast(2)saturate(2) }




```
