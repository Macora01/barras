const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3007;

// --- CAMBIO 1: Configurar CORS para permitir cookies ---
// Esto es fundamental para que el navegador envíe la cookie de sesión
app.use(cors({
    credentials: true // Permite el envío de cookies y encabezados de autenticación
}));

app.use(express.json());
app.use(express.static('public'));

// --- CAMBIO 2: Mejorar la configuración de la sesión para móviles ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto-por-defecto-cambiar-en-produccion',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Requiere HTTPS en producción
        httpOnly: true, // Evita que el cliente (JavaScript) acceda a la cookie
        sameSite: 'lax', // ¡LA CLAVE! Permite que la cookie se envíe en navegaciones del mismo sitio
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Directorio para datos
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Rutas API
app.get('/api/session', (req, res) => {
    // Log para depuración
    console.log(`[SESSION GET] ID: ${req.sessionID}, UserID: ${req.session.userId || 'N/A'}`);
    
    if (!req.session.userId) {
        req.session.userId = 'user_' + Math.random().toString(36).substr(2, 9);
        req.session.scanCount = 0;
        console.log(`[SESSION GET] Creado nuevo UserID: ${req.session.userId}`);
    }
    
    res.json({ 
        userId: req.session.userId,
        scanCount: req.session.scanCount || 0
    });
});

app.post('/api/save-barcode', (req, res) => {
    // Log para depuración
    console.log(`[SAVE POST] ID: ${req.sessionID}, UserID: ${req.session.userId || 'N/A'}`);

    if (!req.session || !req.session.userId) {
        console.error(`[SAVE ERROR] Sesión no válida. SessionID: ${req.sessionID}`);
        return res.status(401).json({ success: false, message: 'Sesión no válida o no iniciada.' });
    }

    const { barcode } = req.body;
    
    if (!barcode) {
        return res.status(400).json({ success: false, message: 'Código de barras requerido' });
    }
    
    // Obtener fecha actual
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Nombre del archivo CSV
    const filename = `barcodes_${dateStr}_${req.session.userId.substring(0, 8)}.csv`;
    const filepath = path.join(dataDir, filename);
    
    // Crear archivo si no existe
    let fileExists = fs.existsSync(filepath);
    
    // Escribir en el archivo CSV
    const csvData = `${now.toISOString()},${barcode}\n`;
    
    try {
        if (fileExists) {
            fs.appendFileSync(filepath, csvData);
        } else {
            fs.writeFileSync(filepath, 'timestamp,barcode\n' + csvData);
        }
        
        // Actualizar contador en sesión
        req.session.scanCount = (req.session.scanCount || 0) + 1;
        
        console.log(`[SAVE SUCCESS] Código guardado. Contador: ${req.session.scanCount}`);
        res.json({ success: true, filename, count: req.session.scanCount });
    } catch (error) {
        console.error('Error al guardar:', error);
        res.status(500).json({ success: false, message: 'Error al guardar el código' });
    }
});

app.post('/api/reset-session', (req, res) => {
    req.session.scanCount = 0;
    res.json({ success: true, count: 0 });
});

// Servir la aplicación principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejar rutas no encontradas
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});