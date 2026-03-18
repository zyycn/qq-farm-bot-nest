import type { ClientConfig } from '@qq-farm/shared/node'
import { Injectable } from '@nestjs/common'
import { GAME_SERVER_URL } from '@qq-farm/shared'
import { DeviceProfileService } from '@/modules/device/application/device-profile.service'
import { DEVICE_PRESETS } from '@/modules/device/domain/device-presets'

export type DeviceConfigSource = 'account_profile' | 'global_default_profile' | 'built_in_default_preset'
export type DeviceSelectionKind = 'preset' | 'custom'

export interface ResolvedDeviceConfig {
  clientConfig: ClientConfig
  source: DeviceConfigSource
  selectedKind: DeviceSelectionKind
  selectedProfileId: string | null
  basePresetId: string | null
  usedFallback: boolean
  fallbackFields: string[]
}

interface SelectedDeviceProfile {
  profile: Record<string, unknown>
  selectedKind: DeviceSelectionKind
  selectedProfileId: string
  basePresetId: string | null
}

function normalizeString(value: unknown, fallback = ''): string {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

@Injectable()
export class DeviceFingerprintService {
  constructor(private readonly deviceProfiles: DeviceProfileService) {}

  resolveAccountDeviceConfig(
    accountDeviceProfileId: string | null | undefined,
    defaultDeviceProfileId: string | null | undefined
  ): ResolvedDeviceConfig {
    const accountProfileId = this.normalizeProfileId(accountDeviceProfileId)
    const defaultProfileId = this.normalizeProfileId(defaultDeviceProfileId)

    if (accountProfileId)
      return this.buildResolvedConfig(accountProfileId, 'account_profile')

    if (defaultProfileId)
      return this.buildResolvedConfig(defaultProfileId, 'global_default_profile')

    const basePreset = DEVICE_PRESETS.find(preset => preset.id === 'iphone-15-pro-max') ?? DEVICE_PRESETS[0]
    return this.buildResolvedConfig(`preset:${basePreset.id}`, 'built_in_default_preset')
  }

  resolveForAccount(deviceProfileId: string | null | undefined): ClientConfig {
    return this.resolveAccountDeviceConfig(deviceProfileId, null).clientConfig
  }

  private buildResolvedConfig(
    selectedProfileId: string,
    source: DeviceConfigSource
  ): ResolvedDeviceConfig {
    const selected = this.resolveSelectedProfile(selectedProfileId)
    const basePreset = DEVICE_PRESETS.find(preset => preset.id === 'iphone-15-pro-max') ?? DEVICE_PRESETS[0]
    const selectedBasePreset = selected?.basePresetId
      ? DEVICE_PRESETS.find(preset => preset.id === selected.basePresetId)
      : null
    const effectiveBasePreset = selectedBasePreset ?? basePreset
    const selectedProfile = selected?.profile ?? {}
    const fallbackFields: string[] = []

    const pickConfigString = (
      field: string,
      selectedValue: unknown,
      baseValue: unknown
    ): string => {
      const normalizedSelected = String(selectedValue ?? '').trim()
      if (normalizedSelected)
        return normalizedSelected
      fallbackFields.push(field)
      return normalizeString(baseValue)
    }

    const pickDeviceString = (field: string, selectedValue: unknown, baseValue: unknown): string => {
      const normalizedSelected = String(selectedValue ?? '').trim()
      if (normalizedSelected)
        return normalizedSelected
      fallbackFields.push(field)
      return normalizeString(baseValue)
    }

    const pickDeviceNumber = (field: string, selectedValue: unknown, baseValue: unknown): number => {
      const normalizedSelected = Number(selectedValue)
      if (Number.isFinite(normalizedSelected) && normalizedSelected > 0)
        return normalizedSelected
      fallbackFields.push(field)
      const normalizedBase = Number(baseValue)
      return Number.isFinite(normalizedBase) ? normalizedBase : 0
    }

    const clientConfig: ClientConfig = {
      serverUrl: pickConfigString('serverUrl', selectedProfile.serverUrl, GAME_SERVER_URL),
      clientVersion: pickConfigString('clientVersion', selectedProfile.clientVersion, effectiveBasePreset.profile.clientVersion),
      platform: pickDeviceString('platform', selectedProfile.platform, effectiveBasePreset.profile.platform),
      os: pickDeviceString('os', selectedProfile.os, effectiveBasePreset.profile.os),
      userAgent: pickDeviceString('userAgent', selectedProfile.userAgent, effectiveBasePreset.profile.userAgent),
      origin: pickConfigString('origin', selectedProfile.origin, effectiveBasePreset.profile.origin),
      deviceInfo: {
        sysSoftware: pickDeviceString('deviceInfo.sysSoftware', selectedProfile.sysSoftware, effectiveBasePreset.profile.sysSoftware),
        sysHardware: pickDeviceString('deviceInfo.sysHardware', selectedProfile.sysHardware, effectiveBasePreset.profile.sysHardware),
        telecomOper: pickDeviceString('deviceInfo.telecomOper', selectedProfile.telecomOper, effectiveBasePreset.profile.telecomOper),
        network: pickDeviceString('deviceInfo.network', selectedProfile.network, effectiveBasePreset.profile.network),
        screenWidth: pickDeviceNumber('deviceInfo.screenWidth', selectedProfile.screenWidth, effectiveBasePreset.profile.screenWidth),
        screenHeight: pickDeviceNumber('deviceInfo.screenHeight', selectedProfile.screenHeight, effectiveBasePreset.profile.screenHeight),
        density: pickDeviceNumber('deviceInfo.density', selectedProfile.density, effectiveBasePreset.profile.density),
        cpu: pickDeviceString('deviceInfo.cpu', selectedProfile.cpu, effectiveBasePreset.profile.cpu),
        memory: String(pickDeviceNumber('deviceInfo.memory', selectedProfile.memory, effectiveBasePreset.profile.memory)),
        glRender: pickDeviceString('deviceInfo.glRender', selectedProfile.glRender, effectiveBasePreset.profile.glRender),
        glVersion: pickDeviceString('deviceInfo.glVersion', selectedProfile.glVersion, effectiveBasePreset.profile.glVersion),
        deviceId: pickDeviceString('deviceInfo.deviceId', selectedProfile.deviceId, effectiveBasePreset.profile.deviceId),
        androidOaid: pickDeviceString('deviceInfo.androidOaid', selectedProfile.androidOaid, effectiveBasePreset.profile.androidOaid),
        iosCaid: pickDeviceString('deviceInfo.iosCaid', selectedProfile.iosCaid, effectiveBasePreset.profile.iosCaid)
      }
    }

    return {
      clientConfig,
      source,
      selectedKind: selected?.selectedKind ?? 'preset',
      selectedProfileId: selected?.selectedProfileId ?? selectedProfileId,
      basePresetId: effectiveBasePreset.id,
      usedFallback: fallbackFields.length > 0,
      fallbackFields
    }
  }

  private normalizeProfileId(deviceProfileId: string | null | undefined): string | null {
    const normalized = String(deviceProfileId ?? '').trim()
    return normalized || null
  }

  private resolveSelectedProfile(deviceProfileId: string | null | undefined): SelectedDeviceProfile | null {
    const normalized = this.normalizeProfileId(deviceProfileId)
    if (!normalized)
      return null

    if (normalized.startsWith('preset:')) {
      const presetId = normalized.slice('preset:'.length)
      const preset = DEVICE_PRESETS.find(candidate => candidate.id === presetId)
      return preset
        ? {
            profile: { ...preset.profile },
            selectedKind: 'preset',
            selectedProfileId: normalized,
            basePresetId: preset.id
          }
        : null
    }

    const profile = this.deviceProfiles.getById(normalized)
    if (!profile)
      return null

    return {
      profile: { ...(profile.profile as Record<string, unknown>) },
      selectedKind: 'custom',
      selectedProfileId: normalized,
      basePresetId: profile.presetId ? String(profile.presetId) : null
    }
  }
}
