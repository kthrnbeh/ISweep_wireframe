// offscreen.js
/**
 * Offscreen document for audio capture and streaming (MV3 workaround for Service Worker limitations)
 * Handles: chrome.tabCapture, MediaRecorder, chunked audio streaming to backend /asr/stream endpoint
 */

(() => {
    'use strict';

    const CHUNK_INTERVAL_MS = 1000; // 1 second chunks
    const METRICS_INTERVAL_MS = 5000; // Report metrics every 5 seconds
    let mediaRecorder = null;
    let stream = null;
    let sessionActive = false;
    let sequenceNumber = 0;
    let tabId = null;
    let backendUrl = null;
    let userId = null;

    // Latency monitoring
    let sendTimings = []; // [{ sendTime, rttTime }, ...]
    let currentChunkStartTime = null;
    let lastSeq = 0;

    function asrLog(...args) {
        console.log('[ISweep-ASR]', ...args);
    }

    /**
     * Update ASR status in storage
     */
    async function updateAsrStatus(status) {
        try {
            await chrome.storage.local.set({ isweep_asr_status: status });
            asrLog('ASR status updated:', status);
        } catch (e) {
            asrLog('Failed to update ASR status:', e);
        }
    }

    /**
     * Calculate and post rolling average metrics
     */
    async function reportMetrics() {
        if (sendTimings.length === 0) return;

        const avgSendMs = Math.round(
            sendTimings.reduce((sum, t) => sum + t.sendTime, 0) / sendTimings.length
        );
        const avgRttMs = Math.round(
            sendTimings.reduce((sum, t) => sum + t.rttTime, 0) / sendTimings.length
        );

        const metrics = {
            avg_send_ms: avgSendMs,
            avg_rtt_ms: avgRttMs,
            last_seq: lastSeq,
            updated_at: new Date().toISOString()
        };

        try {
            await chrome.storage.local.set({ isweep_asr_metrics: metrics });
            asrLog(`Metrics: send=${avgSendMs}ms, rtt=${avgRttMs}ms, last_seq=${lastSeq}`);
            // Keep rolling average of last 10 measurements
            sendTimings = sendTimings.slice(-10);
        } catch (e) {
            asrLog('Failed to report metrics:', e);
        }
    }

    /**
     * Start audio capture from tab and stream to backend
     * @param {number} tabIdParam - Chrome tab ID to capture
     * @param {string} backendUrlParam - Backend URL (e.g., http://127.0.0.1:8001)
     * @param {string} userIdParam - User ID for tracking
     */
    async function startAudioCapture(tabIdParam, backendUrlParam, userIdParam) {
        if (sessionActive) {
            asrLog('Session already active, ignoring start request');
            return;
        }

        tabId = tabIdParam;
        backendUrl = backendUrlParam;
        userId = userIdParam;
        sequenceNumber = 0;

        try {
            asrLog(`Starting audio capture for tab ${tabId} -> ${backendUrl}`);

            // Capture tab audio (audio only, no video)
            stream = await chrome.tabCapture.capture({
                audio: true,
                video: false
            });

            if (!stream) {
                asrLog('ERROR: Failed to capture tab audio (stream is null)');
                return;
            }

            asrLog('Tab audio captured successfully');

            // Create MediaRecorder with audio/webm codec
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000 // 128 kbps
            });

            // Collect chunks
            const chunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                asrLog('MediaRecorder stopped');
            };

            mediaRecorder.onerror = (event) => {
                asrLog('MediaRecorder error:', event.error);
            };

            // Start recording
            mediaRecorder.start(CHUNK_INTERVAL_MS);
            sessionActive = true;

            // Timer to periodically request data and stream
            streamAudioChunks();

            asrLog('Audio capture started, streaming chunks every', CHUNK_INTERVAL_MS, 'ms');
        } catch (error) {
            asrLog('ERROR starting audio capture:', error.message || error);
            stopAudioCapture();
        }
    }

    /**
     * Stream audio chunks to backend at regular intervals
     */
    async function streamAudioChunks() {
        const streamInterval = setInterval(async () => {
            if (!sessionActive || !mediaRecorder) {
                clearInterval(streamInterval);
                return;
            }

            try {
                // Request data from recorder (triggers ondataavailable)
                mediaRecorder.requestData();

                // Small delay to allow ondataavailable to fire
                await new Promise(resolve => setTimeout(resolve, 100));

                // Post to backend via message relay (background will handle batch if needed)
                // For now, just log intent
                asrLog(`Chunk ${sequenceNumber} ready for streaming`);
                sequenceNumber++;
            } catch (error) {
                asrLog('Error requesting audio data:', error.message || error);
            }
        }, CHUNK_INTERVAL_MS + 100);
    }

    /**
     * Stop audio capture and cleanup
     */
    function stopAudioCapture() {
        asrLog('Stopping audio capture');

        sessionActive = false;
        sequenceNumber = 0;

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try {
                mediaRecorder.stop();
            } catch (error) {
                asrLog('Error stopping MediaRecorder:', error.message || error);
            }
        }

        if (stream) {
            try {
                stream.getTracks().forEach(track => {
                    track.stop();
                    asrLog('Track stopped:', track.kind);
                });
            } catch (error) {
                asrLog('Error stopping stream tracks:', error.message || error);
            }
        }

        mediaRecorder = null;
        stream = null;
        tabId = null;
        backendUrl = null;
        userId = null;

        asrLog('Audio capture cleanup complete');
    }

    /**
     * Message listener: background.js sends START_ASR and STOP_ASR commands
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'START_ASR') {
            asrLog('Received START_ASR command', message);
            startAudioCapture(message.tabId, message.backendUrl, message.userId);
            sendResponse({ success: true });
        } else if (message.action === 'STOP_ASR') {
            asrLog('Received STOP_ASR command');
            stopAudioCapture();
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Unknown action' });
        }
    });

    asrLog('Offscreen document initialized');
})();
