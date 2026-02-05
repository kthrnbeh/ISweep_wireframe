// offscreen.js
/**
 * Offscreen document for audio capture and streaming (MV3 workaround for Service Worker limitations)
 * Handles: chrome.tabCapture, MediaRecorder, chunked audio streaming to backend /asr/stream endpoint
 */

(() => {
    'use strict';

    const CHUNK_INTERVAL_MS = 1000; // 1 second chunks (baseline)
    const METRICS_INTERVAL_MS = 5000; // Report metrics every 5 seconds
    const SILENCE_TIMEOUT_MS = 30000; // Auto-stop after 30s of no segments
    const ADAPTIVE_CHUNK_THRESHOLD_MS = 500; // Switch to 2s chunks if RTT > 500ms
    
    let mediaRecorder = null;
    let stream = null;
    let sessionActive = false;
    let isRestarting = false; // Guard for adaptive restart final blob
    let sequenceNumber = 0;
    let tabId = null;
    let backendUrl = null;
    let userId = null;
    let currentChunkInterval = CHUNK_INTERVAL_MS;
    let silenceTimer = null;
    let lastSegmentTime = Date.now();
    let audioContext = null;
    let audioClockStartSec = null; // Stable clock anchor for chunk_start_seconds
    let accumulatedChunkSeconds = 0; // Advances per chunk to avoid resets

    // Latency monitoring
    let sendTimings = []; // [{ sendTime, rttTime }, ...]
    let currentChunkStartTime = null;
    let lastSeq = 0;

    // ASR Status: "idle" | "starting" | "streaming" | "error" | "stopped"
    let asrStatus = 'idle';
    let metricsInterval = null;

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

    function updateStatusText(text) {
        const el = document.getElementById('status');
        if (el) el.textContent = text;
        const dbg = document.getElementById('debug');
        if (dbg && dbg.style.display !== 'none') {
            dbg.textContent = text;
        }
    }

    /**
     * Start audio capture from tab and stream to backend
     * @param {number} tabIdParam - Chrome tab ID to capture
     * @param {string} backendUrlParam - Backend URL (configured by user)
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
        currentChunkInterval = CHUNK_INTERVAL_MS;
        lastSegmentTime = Date.now();
        audioClockStartSec = null;
        accumulatedChunkSeconds = 0;
        asrStatus = 'starting';
        await updateAsrStatus(asrStatus);
        updateStatusText('ASR starting...');

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

            // Optional monitor playback for sticky capture/debug
            const monitor = document.getElementById('monitor');
            if (monitor) {
                try {
                    monitor.srcObject = stream;
                    monitor.muted = true;
                    monitor.play().catch(() => {});
                } catch (_) {
                    // ignore monitor errors
                }
            }

            // Stable audio clock anchor
            audioContext = new AudioContext();
            try {
                audioContext.createMediaStreamSource(stream);
            } catch (_) {
                // ignore if context wiring fails; clock still works
            }
            audioClockStartSec = audioContext.currentTime;

            // Create MediaRecorder with audio/webm codec
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000 // 128 kbps
            });

            // Single handler: send each chunk as it becomes available
            mediaRecorder.ondataavailable = async (event) => {
                if (!sessionActive || isRestarting || event.data.size === 0) return;

                const seq = sequenceNumber; // capture current seq for this chunk
                sequenceNumber += 1; // increment immediately

                const chunkStartSeconds = accumulatedChunkSeconds;
                accumulatedChunkSeconds += (currentChunkInterval / 1000); // advance immediately

                const sendStartTime = Date.now();
                const reader = new FileReader();

                reader.onload = async () => {
                    const base64Data = reader.result.split(',')[1];
                    const fetchStartTime = Date.now();

                    try {
                        const response = await fetch(`${backendUrl}/asr/stream`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                user_id: userId,
                                tab_id: tabId,
                                seq,
                                chunk_start_seconds: chunkStartSeconds,
                                mime_type: 'audio/webm;codecs=opus',
                                audio_b64: base64Data
                            })
                        });

                        const fetchEndTime = Date.now();
                        const sendTimeMs = fetchStartTime - sendStartTime;
                        const rttMs = fetchEndTime - fetchStartTime;

                        // Track latency metrics
                        sendTimings.push({ sendTime: sendTimeMs, rttTime: rttMs });
                        lastSeq = seq;

                        if (!response.ok) {
                            asrLog(`Backend error: ${response.status}`);
                            asrStatus = 'error';
                            await updateAsrStatus(asrStatus);
                            await chrome.storage.local.set({
                                isweep_asr_fallback_reason: 'backend_error'
                            });
                            return;
                        }

                        const result = await response.json();

                        if (result.segments && result.segments.length > 0) {
                            // Reset silence timer on successful segment delivery
                            lastSegmentTime = Date.now();
                            if (silenceTimer) {
                                clearTimeout(silenceTimer);
                            }
                            silenceTimer = setTimeout(() => {
                                asrLog('Silence timeout - stopping ASR');
                                stopAudioCapture();
                            }, SILENCE_TIMEOUT_MS);

                            chrome.runtime.sendMessage({
                                action: 'ASR_SEGMENTS',
                                tabId: tabId,
                                segments: result.segments
                            }).catch(err => {
                                asrLog('Failed to send segments to background:', err.message);
                            });

                            asrLog(`Streamed seq ${seq}: ${result.segments.length} segments, send=${sendTimeMs}ms, rtt=${rttMs}ms, chunkStart=${chunkStartSeconds.toFixed(2)}s`);
                        }

                        // Adaptive chunk sizing: increase interval if RTT consistently high
                        if (rttMs > ADAPTIVE_CHUNK_THRESHOLD_MS && currentChunkInterval === CHUNK_INTERVAL_MS) {
                            const recentHighLatency = sendTimings.slice(-3).every(t => t.rttTime > ADAPTIVE_CHUNK_THRESHOLD_MS);
                            if (recentHighLatency && mediaRecorder && sessionActive) {
                                currentChunkInterval = 2000;
                                asrLog('High latency detected - switching to 2s chunks');
                                // Restart with new interval
                                isRestarting = true;
                                mediaRecorder.stop();
                            }
                        }
                    } catch (error) {
                        asrLog('Error posting chunk to backend:', error.message || error);
                        asrStatus = 'error';
                        await updateAsrStatus(asrStatus);
                        await chrome.storage.local.set({
                            isweep_asr_fallback_reason: 'network_error'
                        });
                    }
                };

                reader.onerror = () => {
                    asrLog('Error reading chunk as base64');
                };

                reader.readAsDataURL(event.data);
            };

            mediaRecorder.onstop = () => {
                asrLog('MediaRecorder stopped');
                if (isRestarting && sessionActive) {
                    isRestarting = false;
                    try {
                        mediaRecorder.start(currentChunkInterval);
                        asrLog('MediaRecorder restarted at interval', currentChunkInterval, 'ms');
                    } catch (e) {
                        asrLog('Failed to restart MediaRecorder:', e.message || e);
                    }
                }
            };

            mediaRecorder.onerror = (event) => {
                asrLog('MediaRecorder error:', event.error);
            };

            // Start recording - chunks emitted automatically every CHUNK_INTERVAL_MS
            mediaRecorder.start(CHUNK_INTERVAL_MS);
            sessionActive = true;
            asrStatus = 'streaming';
            await updateAsrStatus(asrStatus);
            updateStatusText('ASR streaming');

            // Start metrics reporting interval
            if (metricsInterval) clearInterval(metricsInterval);
            metricsInterval = setInterval(reportMetrics, METRICS_INTERVAL_MS);

            asrLog('Audio capture started, streaming chunks every', CHUNK_INTERVAL_MS, 'ms');
        } catch (error) {
            asrLog('ERROR starting audio capture:', error.message || error);
            asrStatus = 'error';
            await updateAsrStatus(asrStatus);
            updateStatusText('ASR error');
            stopAudioCapture();
        }
    }



    /**
     * Stop audio capture and cleanup
     */
    async function stopAudioCapture() {
        asrLog('Stopping audio capture');

        sessionActive = false;
        sequenceNumber = 0;
        asrStatus = 'stopped';
        await updateAsrStatus(asrStatus);
        updateStatusText('ASR stopped');

        // Clear metrics interval
        if (metricsInterval) {
            clearInterval(metricsInterval);
            metricsInterval = null;
        }
        // [ISweep-ASR] Session start: 120.47s
        // [ISweep-ASR] sessionStart=120.47 segEnd=0.82 → abs=121.29
        // [ISweep-ASR] sessionStart=120.47 segEnd=1.54 → abs=122.01
        // Clear silence timer
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }

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

        if (audioContext) {
            try { await audioContext.close(); } catch (_) {}
        }

        mediaRecorder = null;
        stream = null;
        tabId = null;
        backendUrl = null;
        userId = null;
        audioContext = null;
        audioClockStartSec = null;
        accumulatedChunkSeconds = 0;

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
