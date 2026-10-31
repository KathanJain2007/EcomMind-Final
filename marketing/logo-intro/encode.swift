// Encodes PNG frames to H.264 and muxes in AAC audio, using only macOS AVFoundation.
// usage: encode <framesDir> <fps> <audio.m4a> <out.mp4> <width> <height>
import AVFoundation
import CoreGraphics
import ImageIO

let args = CommandLine.arguments
let framesDir = URL(fileURLWithPath: args[1], isDirectory: true)
let fps = Int32(args[2])!
let audioURL = URL(fileURLWithPath: args[3])
let outURL = URL(fileURLWithPath: args[4])
let silentURL = FileManager.default.temporaryDirectory.appendingPathComponent("logo-intro-\(UUID().uuidString).mov")
let width = Int(args[5])!, height = Int(args[6])!

let frames = try FileManager.default.contentsOfDirectory(at: framesDir, includingPropertiesForKeys: nil)
    .filter { $0.lastPathComponent.hasPrefix("f") && $0.pathExtension == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
guard !frames.isEmpty else { fatalError("no frames in \(framesDir.path)") }

let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mov)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 18_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: fps,
        AVVideoMaxKeyFrameIntervalKey: fps,
    ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
guard writer.startWriting() else { fatalError("writer: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
for (i, url) in frames.enumerated() {
    autoreleasepool {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("bad frame \(url.path)") }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
        let pixels = buffer!
        CVBufferSetAttachment(pixels, kCVImageBufferCGColorSpaceKey, sRGB, .shouldPropagate)
        CVPixelBufferLockBaseAddress(pixels, [])
        let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(pixels), width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixels), space: sRGB,
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        CVPixelBufferUnlockBaseAddress(pixels, [])
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
        guard adaptor.append(pixels, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) else {
            fatalError("append failed: \(String(describing: writer.error))")
        }
    }
}
input.markAsFinished()
let videoDone = DispatchSemaphore(value: 0)
writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frames.count), timescale: fps))
writer.finishWriting { videoDone.signal() }
videoDone.wait()
guard writer.status == .completed else { fatalError("writer: \(String(describing: writer.error))") }

// Mux. Audio is trimmed to the video's exact duration.
let videoAsset = AVURLAsset(url: silentURL)
let audioAsset = AVURLAsset(url: audioURL)
let duration = CMTime(value: CMTimeValue(frames.count), timescale: fps)
let range = CMTimeRange(start: .zero, duration: duration)
let composition = AVMutableComposition()
let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try videoTrack.insertTimeRange(range, of: videoAsset.tracks(withMediaType: .video)[0], at: .zero)
let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try audioTrack.insertTimeRange(range, of: audioAsset.tracks(withMediaType: .audio)[0], at: .zero)

try? FileManager.default.removeItem(at: outURL)
let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough)!
export.outputURL = outURL
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = true
let exportDone = DispatchSemaphore(value: 0)
export.exportAsynchronously { exportDone.signal() }
exportDone.wait()
try? FileManager.default.removeItem(at: silentURL)
guard export.status == .completed else { fatalError("export: \(String(describing: export.error))") }
print("wrote \(outURL.path) (\(frames.count) frames at \(fps) fps)")
