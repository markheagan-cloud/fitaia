from faster_whisper import WhisperModel
import sys
m = WhisperModel('small', device='cpu', compute_type='int8')
segs, info = m.transcribe(r'C:\Users\33766\Desktop\FITAIA\hero3d\video\audio.wav', beam_size=1, vad_filter=True)
with open(r'C:\Users\33766\Desktop\FITAIA\hero3d\video\transcript.txt', 'w', encoding='utf-8') as f:
    f.write('LANG ' + info.language + '\n')
    for s in segs:
        f.write('[%d] %s\n' % (int(s.start), s.text.strip()))
print('OK')
