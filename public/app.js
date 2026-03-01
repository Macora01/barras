document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const startScanBtn = document.getElementById('start-scan');
    const stopScanBtn = document.getElementById('stop-scan');
    const nextBtn = document.getElementById('next-btn');
    const finishBtn = document.getElementById('finish-btn');
    const scanCount = document.getElementById('scan-count');
    const lastBarcode = document.getElementById('last-barcode');
    const sessionId = document.getElementById('session-id');
    const resetBtn = document.getElementById('reset-btn');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmFinishBtn = document.getElementById('confirm-finish');
    const cancelFinishBtn = document.getElementById('cancel-finish');
    const notification = document.getElementById('notification');
    
    // Variables de estado
    let isScanning = false;
    let scannedCodes = [];
    let lastScannedCode = null;
    let scanTimeout = null;
    let currentSessionId = null;
    let isSessionReady = false; // <-- NUEVA VARIABLE DE ESTADO
    
    // Inicializar sesión
    function initSession() {
        fetch('/api/session')
            .then(response => {
                if (!response.ok) {
                    throw new Error('No se pudo inicializar la sesión.');
                }
                return response.json();
            })
            .then(data => {
                currentSessionId = data.userId;
                sessionId.textContent = currentSessionId.substring(0, 8) + '...';
                scanCount.textContent = data.count || 0;
                isSessionReady = true; // <-- MARCAR COMO LISTA
                startScanBtn.disabled = false; // <-- HABILITAR BOTÓN
            })
            .catch(error => {
                console.error('Error al inicializar sesión:', error);
                showNotification('Error al inicializar la aplicación. Recargando...', 'error');
                // Recargar la página si la sesión falla al iniciar
                setTimeout(() => location.reload(), 2000);
            });
    }
    
    // Event Listeners
    startScanBtn.addEventListener('click', startScanning);
    stopScanBtn.addEventListener('click', stopScanning);
    nextBtn.addEventListener('click', handleNext);
    finishBtn.addEventListener('click', showFinishConfirmation);
    confirmFinishBtn.addEventListener('click', finishScanning);
    cancelFinishBtn.addEventListener('click', hideFinishConfirmation);
    resetBtn.addEventListener('click', resetSession);
    
    // Función para iniciar el escaneo
    function startScanning() {
        if (!isSessionReady) {
            showNotification('La sesión no está lista. Por favor, espere.', 'warning');
            return;
        }
        // Solicitar permisos de cámara
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                video.srcObject = stream;
                video.setAttribute('playsinline', true);
                video.play();
                
                // Configurar Quagga
                Quagga.init({
                    inputStream: {
                        name: "Live",
                        type: "LiveStream",
                        target: video
                    },
                    decoder: {
                        readers: [
                            "code_128_reader",
                            "ean_reader",
                            "ean_8_reader",
                            "code_39_reader",
                            "code_39_vin_reader",
                            "codabar_reader",
                            "upc_reader",
                            "upc_e_reader",
                            "i2of5_reader"
                        ]
                    }
                }, function(err) {
                    if (err) {
                        console.error('Error al inicializar Quagga:', err);
                        showNotification('Error al iniciar la cámara: ' + err.message, 'error');
                        return;
                    }
                    
                    Quagga.start();
                    isScanning = true;
                    startScanBtn.disabled = true;
                    stopScanBtn.disabled = false;
                    
                    // Escuchar detecciones de códigos de barras
                    Quagga.onDetected(onBarcodeDetected);
                });
            })
            .catch(err => {
                console.error('Error al acceder a la cámara:', err);
                showNotification('Error al acceder a la cámara: ' + err.message, 'error');
            });
    }
    
    // Función para detener el escaneo
    function stopScanning() {
        if (isScanning) {
            Quagga.stop();
            
            // Detener el stream de video
            const stream = video.srcObject;
            if (stream) {
                const tracks = stream.getTracks();
                tracks.forEach(track => track.stop());
            }
            
            video.srcObject = null;
            isScanning = false;
            startScanBtn.disabled = !isSessionReady; // <-- El botón depende de la sesión
            stopScanBtn.disabled = true;
        }
    }
    
    // Función para manejar la detección de códigos de barras
    function onBarcodeDetected(result) {
        const code = result.codeResult.code;
        
        // Evitar escaneos duplicados del mismo código
        if (code === lastScannedCode) {
            return;
        }
        
        // Actualizar el último código escaneado
        lastScannedCode = code;
        lastBarcode.textContent = code;
        
        // Agregar a la lista de códigos escaneados
        scannedCodes.push(code);
        
        // Guardar el código en el servidor
        saveBarcode(code);
        
        // Habilitar botones
        nextBtn.disabled = false;
        finishBtn.disabled = false;
        
        // Limpiar el último código escaneado después de 2 segundos
        if (scanTimeout) {
            clearTimeout(scanTimeout);
        }
        scanTimeout = setTimeout(() => {
            lastScannedCode = null;
        }, 2000);
        
        // Mostrar notificación
        showNotification(`Código escaneado: ${code}`, 'success');
    }
    
    // Función para guardar un código de barras
    function saveBarcode(code) {
        fetch('/api/save-barcode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ barcode: code })
        })
        .then(response => {
            if (!response.ok) {
                // Si el error es 401, la sesión no es válida
                if (response.status === 401) {
                    throw new Error('SESSION_INVALID');
                }
                throw new Error('Error del servidor al guardar.');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                scanCount.textContent = data.count;
                console.log('Código guardado en:', data.filename);
            } else {
                throw new Error(data.message || 'Error al guardar el código');
            }
        })
        .catch(error => {
            console.error('Error al guardar el código:', error);
            // MANEJO ESPECÍFICO PARA SESIÓN INVÁLIDA
            if (error.message === 'SESSION_INVALID') {
                showNotification('La sesión ha expirado. Recargando la aplicación...', 'error');
                stopScanning(); // Detener el escaneo
                setTimeout(() => location.reload(), 2500); // Recargar la página
            } else {
                showNotification('Error al guardar el código: ' + error.message, 'error');
            }
        });
    }
    
    // ... (el resto de las funciones como handleNext, finishScanning, etc. permanecen igual)
    function handleNext() {
        lastBarcode.textContent = '-';
        lastScannedCode = null;
        showNotification('Listo para escanear el siguiente código', 'info');
    }
    
    function showFinishConfirmation() {
        confirmModal.style.display = 'flex';
    }
    
    function hideFinishConfirmation() {
        confirmModal.style.display = 'none';
    }
    
    function finishScanning() {
        stopScanning();
        hideFinishConfirmation();
        
        scannedCodes = [];
        lastBarcode.textContent = '-';
        
        nextBtn.disabled = true;
        finishBtn.disabled = true;
        
        showNotification('Escaneo finalizado. Los datos han sido guardados.', 'success');
    }
    
    function resetSession() {
        fetch('/api/reset-session', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                scanCount.textContent = data.count;
                scannedCodes = [];
                lastBarcode.textContent = '-';
                nextBtn.disabled = true;
                finishBtn.disabled = true;
                showNotification('Sesión reiniciada correctamente', 'success');
            }
        })
        .catch(error => {
            console.error('Error al reiniciar sesión:', error);
            showNotification('Error al reiniciar sesión', 'error');
        });
    }
    
    function showNotification(message, type = 'info') {
        notification.textContent = message;
        notification.className = 'notification ' + type;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
    
    // Inicializar la aplicación
    initSession();
    
    // Deshabilitar el botón de escaneo hasta que la sesión esté lista
    startScanBtn.disabled = true; 
});