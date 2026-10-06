import SwiftUI

// Phase 0: nur die Simulator-Probe. Sie zeigt, auf welchem System die App
// gerade läuft — gemessen, nicht ausgedacht. Ab Phase 1 steht hier die
// echte App (Login, Dashboard, Bestellungen, Reservierungen).

@main
struct TelefonRetterApp: App {
    var body: some Scene {
        WindowGroup {
            ProbeView()
        }
    }
}

struct ProbeView: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let device = UIDevice.current
        let geraet = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] ?? device.model

        VStack(alignment: .leading, spacing: 32) {
            Spacer()

            Image(systemName: "phone.and.waveform.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)

            VStack(alignment: .leading, spacing: 10) {
                Text("Telefon-Retter")
                    .font(.largeTitle.bold())
                Text("Simulator-Probe aus Phase 0. Hier entsteht die App für den Wirt.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 14) {
                InfoZeile(titel: "System", wert: "\(device.systemName) \(device.systemVersion)")
                Divider()
                InfoZeile(titel: "Gerät", wert: geraet)
                Divider()
                InfoZeile(titel: "Darstellung", wert: colorScheme == .dark ? "Dunkel" : "Hell")
            }
            .padding(20)
            .background(.background.secondary, in: .rect(cornerRadius: 20))

            Spacer()
        }
        .padding(28)
        .frame(maxWidth: 560, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .tint(Color(red: 0.12, green: 0.42, blue: 0.40))
    }
}

private struct InfoZeile: View {
    let titel: String
    let wert: String

    var body: some View {
        HStack {
            Text(titel)
                .foregroundStyle(.secondary)
            Spacer()
            Text(wert)
                .fontWeight(.medium)
        }
        .font(.body)
    }
}
