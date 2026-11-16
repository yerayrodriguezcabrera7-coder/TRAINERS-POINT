# Recursos de Pago y APIs Requeridos
## Trainers Point — Propuesta de Inversión

---

## 1. 🏪 CUENTAS DE TIENDAS DE APLICACIONES

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Apple Developer Program** | $99 / año | Anual | Publicar app en App Store (iPhone/iPad/Mac) |
| **Google Play Console** | $25 | Único (pago único) | Publicar app en Google Play Store |
| **Subtotal** | **$124 (primer año) / $99/año** | | |

> Sin esto la app no aparece en ninguna tienda oficial.

---

## 2. 💳 PASARELA DE PAGO (Bonos, Cuotas, Renovable)

El sistema ya tiene la estructura preparada (`paymentStatus`, `paymentPending`, `Sale`), pero falta la integración real:

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Stripe** | 2.9% + $0.30 por transacción | Por venta | Tarjeta de crédito/débito, Apple Pay, Google Pay |
| **Stripe Billing** | Incluido | — | Suscripciones recurrentes (bonos mensuales, cuotas de gimnasio) |
| Alternativa: **Mercado Pago** | ~3.5% por transacción | Por venta | Alternativa para mercado hispano, incluye Pix, transferencia |
| Alternativa: **Redsys/TPV Virtual** | 20-40€/mes fijo + comisión | Mensual | Bancos españoles (Santander, BBVA, etc.) |

### Funcionalidades que habilita:
- Pago de bonos de sesiones (ej: 10 sesiones)
- Suscripción mensual del gimnasio
- Pagos de packs personalizados
- Renovación automática de bonos
- Reembolsos y anulaciones
- Facturación automática (PDF por email)

---

## 3. ☁️ ALMACENAMIENTO EN NUBE (Imágenes y Documentación)

Actualmente no hay almacenamiento de imágenes. Se necesitará para:
- Fotos de perfil de clientes y entrenadores
- Fotos de productos de la tienda
- Logo y branding del gimnasio
- Documentos legales y contratos

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Cloudflare R2** | 0.01$/GB/mes + 0.01$/GB download | Según uso | ~500 GB incluidos gratis, ideal para imágenes |
| Alternativa: **AWS S3** | 0.023$/GB/mes | Según uso | Estándar de la industria |
| Alternativa: **Vercel Blob** | Gratis hasta cierto límite | — | Fácil integración con Next.js |

> **Estimación realista:** 2-5$/mes con uso normal

---

## 4. 📧 SERVICIO DE EMAILS transaccionales

Para enviar:
- Confirmación de reservas
- Recordatorios de cita (24h antes)
- Facturas y comprobantes de pago
- Recuperación de contraseña
- Notificaciones de bonos por agotarse

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Resend** | Gratis hasta 5.000 emails/mes | — | Ideal para empezar |
| **Resend** | $24/mes (Pro) | Mensual | 25.000 emails/mes |
| Alternativa: **AWS SES** | $0.10 por 1.000 emails | Por uso | Muy barato, escala muy bien |
| Alternativa: **SendGrid** | Gratis hasta 100 emails/día | — | 9$/mes para 40.000/mes |

---

## 5. 🔔 NOTIFICACIONES PUSH

Para enviar alertas al móvil del cliente:
- Recordatorio de cita (30 min antes)
- Cita confirmada/cancelada
- Bonos por agotarse
- Promociones del gimnasio
- Actualizaciones de plan de entrenamiento

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Expo Push Notifications** | Gratis (hasta cierto límite) | — | Incluye el SDK de React Native/Expo |
| **Firebase Cloud Messaging (FCM)** | Gratis | — | Google, ideal para Android |
| **Apple Push Notification Service (APNs)** | Gratis (incluido en Apple Developer) | — | iOS, configurado con la cuenta de $99/año |
| **OneSignal** | Gratis hasta 10.000 usuarios | — | Unifica push de iOS + Android |
| **OneSignal Pro** | 53$/mes | Mensual | Si crece mucho, más funciones avanzadas |

> **Para empezar:** Expo Push + APNs/FCM es **gratuito**

---

## 6. 📍 MAPAS Y GEOLOCALIZACIÓN

Para mostrar la ubicación del gimnasio en las reservas:

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Google Maps Platform** | Gratis hasta 200$ créditos/mes | — | Direcciones, embedding de mapas, geocodificación |
| Alternativa: **Mapbox** | 5$/mes hasta 50.000 cargas | — | Más barato para mapas personalizados |
| Alternativa: **OpenStreetMap** | Gratis (self-hosted) | — | Sin coste, pero requiere infra propia |

---

## 7. 🤖 INTELIGENCIA ARTIFICIAL (Opcional — Futuro)

Para funcionalidades avanzadas que no están en la fase actual:

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **OpenAI API (GPT)** | 0.001$/1K tokens | Por uso | Generar planes de entrenamiento, nutrición, chatbot |
| **Google Gemini** | 0.125$/1M tokens | Por uso | Alternativa más barata a OpenAI |
| **Replicate (stable diffusion)** | 0.00033$/iteración | Por uso | Generar imágenes de ejercicios, ilustraciones |

> ⚠️ **Estos NO son necesarios para la fase actual** — se dejan como ampliación futura

---

## 8. 🔒 SSL / CERTIFICADOS / DOMINIO

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Nombre de dominio** | 10-15$/año | Anual | Ej: `app.trainerspoint.com` |
| **SSL (Let's Encrypt)** | Gratis | — | Auto-renovable, se integra con Railway |
| **Cloudflare Pro** | 20$/mes | Mensual | CDN, protección DDoS, WAF, DNS rápido |
| Alternativa: **Cloudflare Free** | Gratis | — | Cubre lo básico (DNS, SSL, CDN básico) |

---

## 9. 📊 MONITOREO Y ANALÍTICAS (Opcional)

| Servicio | Coste | Frecuencia | Uso |
|----------|-------|------------|-----|
| **Sentry** | Gratis hasta 5.000 eventos/mes | — | Error tracking (crashes, errores) |
| **Sentry Pro** | 26$/mes | Mensual | Más eventos, retención extendida |
| **PostHog** | Gratis hasta 1M eventos | — | Analytics de uso de la app |
| **Google Analytics** | Gratis | — | Analytics web tradicional |

---

## 💰 RESUMEN TOTAL ESTIMADO

### Fase 1 (Mínimo viable)
| Concepto | Coste inicial | Coste mensual |
|----------|---------------|---------------|
| Apple Developer | $99 | — |
| Google Play | $25 | — |
| Stripe (solo comisión por venta) | 0$ | Variable (2.9% + 0.30$) |
| Resend (Pro) | — | 24$ |
| Cloudflare (Free) | 0$ | 0$ |
| **Total Fase 1** | **$124** | **~24$ + comisiones Stripe** |

### Fase 2 (Con todo integrado)
| Concepto | Coste adicional | Coste mensual |
|----------|-----------------|---------------|
| Stripe | — | Comisiones por ventas reales |
| Cloudflare Pro | — | 20$ |
| AWS SES | — | ~3-5$ |
| Google Maps | — | Variable (gratis hasta 200$) |
| OneSignal (Free) | — | 0$ |
| **Total Fase 2** | **$124** | **~50-80$ + comisiones Stripe** |

### Fase 3 (Ampliaciones futuras — IA)
| Concepto | Coste adicional | Coste mensual |
|----------|-----------------|---------------|
| OpenAI API | — | Variable según uso |
| Cloudflare Pro | — | 20$ |
| Sentry Pro | — | 26$ |
| **Total Fase 3** | **$124** | **~100-300$+ según uso** |

---

## 📋 RESUMEN EJECUTIVO PARA PRESUPUESTO

### Inversión única necesaria (primer mes):
| Concepto | Importe |
|----------|---------|
| Apple Developer Program | $99 |
| Google Play Console | $25 |
| Dominio web | ~15$ |
| **TOTAL INICIAL** | **~$139** |

### Coste mensual recurrente (mínimo):
| Concepto | Importe |
|----------|---------|
| Resend (emails) | 24$ |
| Stripe (solo comisión por venta) | Variable |
| **TOTAL MENSUAL MÍNIMO** | **~24$ + comisiones** |

### Coste mensual recomendado (todo incluido):
| Concepto | Importe |
|----------|---------|
| Resend Pro (emails) | 24$ |
| Cloudflare Pro (seguridad + CDN) | 20$ |
| AWS SES (emails alternativos) | 3$ |
| Google Maps | Variable (gratis hasta 200$) |
| Stripe (comisión por venta) | Variable |
| **TOTAL MENSUAL RECOMENDADO** | **~50-80$ + comisiones** |

---

## ⚠️ AVISOS IMPORTANTES

1. **Stripe NO tiene coste fijo mensual** — solo se paga cuando alguien compra algo (2.9% + 0.30$ por transacción)
2. **Las notificaciones push se pueden integrar gratis** con Expo Push + FCM/APNs
3. **Se puede empezar solo con lo básico** ($139 inicial + 24$/mes) y luego añadir servicios
4. **Cada gimnasio puede tener su propio dominio** si se quiere personalizar más adelante
5. **No se necesita infraestructura de servidor adicional** — ya está en Railway

---

*Documento generado para presentación a dirección. Todos los precios son estimaciones basadas en tarifas públicas de cada proveedor (noviembre 2025).*