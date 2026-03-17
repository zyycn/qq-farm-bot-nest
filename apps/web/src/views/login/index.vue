<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useUserStore } from '@/stores'

const router = useRouter()
const userStore = useUserStore()

const password = ref('')
const error = ref('')
const loading = ref(false)
const focused = ref(false)

async function handleLogin() {
  if (!password.value) {
    error.value = '请输入管理密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await authApi.login(password.value)
    userStore.setToken(res.token)
    router.push('/')
  } catch (e: unknown) {
    const err = e as { message?: string }
    error.value = err.message || '登录异常'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="h-[100dvh] w-screen relative overflow-hidden a-bg-container">
    <ThemeToggle class="right-3 top-3 absolute z-30" />

    <!-- Sky gradient -->
    <div
      class="inset-0 absolute z-0"
      :style="{
        background: `linear-gradient(to bottom, var(--ant-color-info-bg) 0%, var(--ant-color-info-border) 45%, var(--ant-color-primary-bg) 100%)`
      }"
    />

    <!-- Grass SVG: Design Token colors -->
    <svg
      class="h-[32%] w-full pointer-events-none bottom-0 left-0 absolute z-1"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="grass" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="var(--ant-color-primary)" stop-opacity="0.35" />
          <stop offset="0.5" stop-color="var(--ant-color-primary)" stop-opacity="0.2" />
          <stop offset="1" stop-color="var(--ant-color-primary)" stop-opacity="0.08" />
        </linearGradient>
      </defs>
      <path d="M0 32V18Q25 8 50 18t50 0v14Z" fill="url(#grass)" />
    </svg>

    <!-- Floating icons (cloud) -->
    <div class="pointer-events-none inset-0 absolute z-2">
      <span
        class="animate-float-1 i-streamline-emojis-cloud-1 absolute"
        :style="{
          top: '10%',
          left: '8%',
          fontSize: '54px',
          color: 'var(--ant-color-bg-layout)'
        }"
      />
      <span
        class="animate-float-2 i-streamline-emojis-cloud-1 absolute"
        :style="{
          top: '25%',
          right: '10%',
          fontSize: '36px',
          color: 'var(--ant-color-bg-layout)',
          opacity: 0.2
        }"
      />
      <span
        class="animate-float-3 i-streamline-emojis-cloud-1 absolute"
        :style="{
          top: '45%',
          left: '5%',
          fontSize: '42px',
          color: 'var(--ant-color-bg-layout)',
          opacity: 0.9
        }"
      />
    </div>

    <!-- Decorations -->
    <div class="pointer-events-none inset-0 absolute z-10">
      <span
        class="i-streamline-emojis-christmas-tree bottom-[36%] left-[6%] absolute max-md:hidden"
        :style="{ fontSize: '40px', color: 'var(--ant-color-primary)', opacity: 1 }"
      />
      <span
        class="i-streamline-emojis-fallen-leaf bottom-[33%] right-[10%] absolute max-md:hidden"
        :style="{ fontSize: '48px', color: 'var(--ant-color-primary)', opacity: 1 }"
      />
      <span
        class="i-streamline-emojis-house-with-garden bottom-[31%] left-[22%] absolute max-md:hidden"
        :style="{ fontSize: '36px', color: 'var(--ant-color-primary-text)', opacity: 1 }"
      />
      <span
        class="i-streamline-emojis-sunflower-1 bottom-[29%] right-[30%] absolute max-md:hidden"
        :style="{ fontSize: '28px', color: 'var(--ant-color-primary)', opacity: 1 }"
      />
      <span
        class="animate-sway i-streamline-emojis-man-farmer-1 bottom-[27%] right-[6%] absolute max-md:bottom-[33%] max-md:right-[4%]"
        :style="{ fontSize: '36px', color: 'var(--ant-color-primary-text)', opacity: 1 }"
      />
    </div>

    <!-- Card -->
    <div class="p-5 flex items-center inset-0 justify-center absolute z-20">
      <a-card
        variant="borderless"
        class="login-card max-w-[380px] w-full relative overflow-hidden rounded-2xl !border-white/30 !bg-white/30 !shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] !backdrop-blur-xl !border"
        :classes="{ body: '!p-0' }"
      >
        <span class="text-[9px] text-white tracking-[0.15em] font-bold px-[5px] bg-[var(--ant-color-primary)] inline-flex h-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] items-center right-2 top-2 absolute rounded">PLUS</span>

        <!-- Brand -->
        <div
          class="px-6 pb-5 pt-8 flex flex-col items-center from-white/40 to-transparent bg-gradient-to-b"
        >
          <img src="/icon.ico" alt="" class="mb-2 h-18 w-18">
          <h1 class="tracking-tight font-bold flex items-center a-color-text text-xl">
            <span class="text-transparent from-[var(--ant-color-primary-text)] to-[var(--ant-color-primary-text)] via-[var(--ant-color-primary)] bg-gradient-to-br bg-clip-text">农场の助手</span>
          </h1>
        </div>

        <!-- Form -->
        <div class="px-8 pb-8 pt-2 relative z-10">
          <a-form layout="vertical" @submit.prevent="handleLogin">
            <a-form-item :validate-status="error ? 'error' : ''" :help="error || undefined" class="mb-6">
              <div class="group relative">
                <!-- Decorative Sprout on Focus -->
                <span
                  class="pointer-events-none transition-all duration-500 ease-out absolute z-0 text-2xl -left-1 -top-4"
                  :class="focused ? 'translate-y-0 opacity-100 rotate-[-10deg]' : 'translate-y-4 opacity-0 rotate-0'"
                >
                  <span class="i-streamline-emojis-seedling block" />
                </span>

                <a-input-password
                  v-model:value="password"
                  placeholder="请输入农场密钥"
                  size="large"
                  autocomplete="current-password"
                  :disabled="loading"
                  class="!a-bg-layout/60 transition-all duration-300 !py-3 !border-0 !backdrop-blur-md !text-base !rounded-2xl"
                  @focus="focused = true"
                  @blur="focused = false"
                >
                  <template #prefix>
                    <span
                      class="mr-2 transition-all duration-300 text-lg dark:text-white/80"
                      :class="[
                        focused ? 'i-streamline-emojis-palm-tree' : 'i-streamline-emojis-locked-with-key',
                        focused ? 'scale-110 rotate-12' : 'opacity-60'
                      ]"
                    />
                  </template>
                </a-input-password>

                <!-- Custom Focus Ring -->
                <div
                  class="border-2 pointer-events-none transition-all duration-300 inset-0 absolute z-10 rounded-2xl"
                  :class="focused ? 'border-green-5/50 scale-[1.02]' : 'border-transparent scale-100'"
                />
              </div>
            </a-form-item>

            <a-button
              html-type="submit"
              type="primary"
              block
              size="large"
              :loading="loading"
              class="group transition-all duration-300 !font-bold !bg-opacity-90 !h-12 active:!scale-[0.98] hover:!scale-[1.02]"
              :style="{ background: 'linear-gradient(135deg, var(--ant-color-primary) 0%, #34d399 100%)' }"
            >
              <template v-if="!loading">
                <span class="i-streamline-emojis-tractor mr-1 transition-transform text-xl group-hover:translate-x-1" />
              </template>
              <span>进入农场</span>
            </a-button>
          </a-form>

          <div class="mt-6 flex justify-center">
            <div class="px-4 py-1.5 border-white/30 rounded-full bg-white/30 flex gap-2 select-none transition-colors items-center backdrop-blur-lg a-color-text border text-xs shadow-sm hover:bg-white/50">
              <span class="i-carbon-security text-green-6 text-sm" />
              <span>安全加密连接</span>
            </div>
          </div>
        </div>
      </a-card>
    </div>
  </div>
</template>

<style scoped>
/* Floating cloud icons */
.animate-float-1 {
  animation: float-drift-1 50s linear infinite;
}

.animate-float-2 {
  animation: float-drift-2 60s linear infinite;
}

.animate-float-3 {
  animation: float-drift-3 55s linear infinite;
  animation-delay: -20s;
}

@keyframes float-drift-1 {
  from {
    transform: translateX(-10vw);
  }
  to {
    transform: translateX(110vw);
  }
}

@keyframes float-drift-2 {
  from {
    transform: translateX(110vw);
  }
  to {
    transform: translateX(-10vw);
  }
}

@keyframes float-drift-3 {
  from {
    transform: translateX(-8vw);
  }
  to {
    transform: translateX(108vw);
  }
}

/* Farmer sway */
@keyframes sway {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg);
  }
}

.animate-sway {
  animation: sway 3s ease-in-out infinite;
}
</style>
