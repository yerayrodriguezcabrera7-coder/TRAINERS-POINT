# Aplicaciones Móviles de Trainers Point & Cobosu

Este directorio contiene las 2 aplicaciones móviles desarrolladas con **React Native + Expo (TypeScript)** conectadas al backend de Trainers Point:

1. **`trainerspoint/`**: Aplicación de Trainers Point (identificador `com.trainerspoint.app`).
2. **`cobosu/`**: Aplicación del centro Cobosu (identificador `com.cobosu.app`).
3. **`shared/`**: Lógica compartida (cliente HTTP `api.ts`, tipos de datos `types.ts` y temas de color `theme.ts`).

---

## Cómo ejecutarlas en desarrollo

### 1. Inicia el servidor backend (en la raíz del proyecto)
```bash
npm run dev
```

### 2. Para arrancar la app de Trainers Point
```bash
cd mobile/trainerspoint
npm install
npm start
```

### 3. Para arrancar la app de Cobosu
```bash
cd mobile/cobosu
npm install
npm start
```

---

## Cómo probar en tu teléfono móvil físico

1. Descarga la app gratuita **Expo Go** desde Google Play (Android) o App Store (iOS).
2. Asegúrate de que tu teléfono y tu ordenador estén en la **misma red Wi-Fi**.
3. En `App.tsx` de cada app, cambia `API_BASE_URL` por la IP local de tu ordenador (por ejemplo: `http://192.168.1.45:3000`).
4. Escanea el código QR que aparece en tu terminal con la cámara (en iOS) o desde Expo Go (en Android).

