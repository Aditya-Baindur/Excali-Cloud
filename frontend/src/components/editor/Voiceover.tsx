'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { useEditorStore } from '@videoflow/react-video-editor'
import { useEditorUI } from './EditorContext'

export default function Voiceover() {
  const ui = useEditorUI()
  const { recording, setRecording } = ui
  const [requesting, setRequesting] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const mounted = useRef(true)
  const setRecordingRef = useRef(setRecording)
  setRecordingRef.current = setRecording
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      setRecordingRef.current(false)
      if (recorder.current) {
        recorder.current.onstop = null
        if (recorder.current.state !== 'inactive') recorder.current.stop()
        recorder.current.stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => setSeconds((time) => time + 1), 1000)
    return () => clearInterval(timer)
  }, [recording])
  async function start() {
    setRequesting(true)
    let stream: MediaStream | undefined
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      )
        throw new Error('Voiceover recording is not supported in this browser.')
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        stream?.getTracks().forEach((track) => track.stop())
        return
      }
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type))
      const instance = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )
      recorder.current = instance
      const state = useEditorStore.getState(),
        startTime = state.currentFrame / state.video.fps
      const parts: Blob[] = []
      instance.ondataavailable = (event) => {
        if (event.data.size) parts.push(event.data)
      }
      instance.onstop = () => {
        stream?.getTracks().forEach((track) => track.stop())
        if (!mounted.current) return
        setRecording(false)
        recorder.current = null
        const type = instance.mimeType || 'audio/webm'
        const file = new File(
          parts,
          `Voiceover ${new Date().toLocaleTimeString().replaceAll(':', '-')}.${type.includes('mp4') ? 'm4a' : 'webm'}`,
          { type }
        )
        if (file.size)
          void ui.recordAudio(file, startTime).catch(ui.reportError)
      }
      instance.onerror = () => {
        stream?.getTracks().forEach((track) => track.stop())
        if (mounted.current) {
          setRecording(false)
          ui.reportError(new Error('Recording failed. Please try again.'))
        }
      }
      instance.start(250)
      setSeconds(0)
      setRecording(true)
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      if (mounted.current) ui.reportError(error)
    } finally {
      if (mounted.current) setRequesting(false)
    }
  }
  return (
    <button
      className={`editor-text-button ${recording ? 'is-recording' : ''}`}
      disabled={requesting || (!recording && !!ui.busy)}
      onClick={() => (recording ? recorder.current?.stop() : void start())}
    >
      {recording ? <Square size={13} fill="currentColor" /> : <Mic size={14} />}{' '}
      {recording
        ? `Stop · ${seconds}s`
        : requesting
          ? 'Connecting…'
          : 'Voiceover'}
    </button>
  )
}
