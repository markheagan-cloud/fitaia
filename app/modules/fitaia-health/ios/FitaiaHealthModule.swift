import ExpoModulesCore
import HealthKit

/// Lecture seule de Santé : c'est là que l'Apple Watch dépose ses mesures. Rien n'est écrit, rien ne quitte le téléphone.
/// Boîte partagée entre les requêtes (accès protégé par `lock`).
private final class HealthBox {
  var values = [String: Any]()
}

public class FitaiaHealthModule: Module {
  private let store = HKHealthStore()
  private let lock = DispatchQueue(label: "fitaia.health.result")

  private func readTypes() -> Set<HKObjectType> {
    var types = Set<HKObjectType>()
    if let t = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(t) }
    if let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(t) }
    if let t = HKObjectType.quantityType(forIdentifier: .heartRate) { types.insert(t) }
    types.insert(HKObjectType.workoutType())
    return types
  }

  public func definition() -> ModuleDefinition {
    Name("FitaiaHealth")

    Constants([
      "isAvailable": HKHealthStore.isHealthDataAvailable()
    ])

    AsyncFunction("requestAccess") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      self.store.requestAuthorization(toShare: nil, read: self.readTypes()) { ok, _ in
        promise.resolve(ok)
      }
    }

    /// Résumé du jour. Une valeur absente (pas de mesure, ou lecture refusée : iOS ne dit pas lequel) est simplement omise.
    AsyncFunction("today") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve([String: Any]())
        return
      }
      let now = Date()
      let start = Calendar.current.startOfDay(for: now)
      let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate)
      let group = DispatchGroup()
      let box = HealthBox()

      func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ key: String) {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return }
        group.enter()
        let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
          if let v = stats?.sumQuantity()?.doubleValue(for: unit) {
            self.lock.sync { box.values[key] = v }
          }
          group.leave()
        }
        self.store.execute(q)
      }
      sum(.stepCount, HKUnit.count(), "steps")
      sum(.activeEnergyBurned, HKUnit.kilocalorie(), "activeKcal")

      if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) {
        group.enter()
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: hr, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
          if let s = samples?.first as? HKQuantitySample {
            let bpm = s.quantity.doubleValue(for: HKUnit.count().unitDivided(by: HKUnit.minute()))
            self.lock.sync {
              box.values["heartRate"] = bpm
              box.values["heartRateAt"] = s.endDate.timeIntervalSince1970 * 1000
            }
          }
          group.leave()
        }
        self.store.execute(q)
      }

      group.enter()
      let wq = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
        if let ws = samples as? [HKWorkout] {
          let minutes = ws.reduce(0.0) { $0 + $1.duration } / 60.0
          self.lock.sync {
            box.values["workouts"] = ws.count
            box.values["workoutMinutes"] = minutes
          }
        }
        group.leave()
      }
      self.store.execute(wq)

      group.notify(queue: .main) {
        let out = self.lock.sync { box.values }
        promise.resolve(out)
      }
    }
  }
}
