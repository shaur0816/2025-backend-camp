<template>
  <div class="min-h-screen bg-primary-900 flex items-center justify-center px-4">
    <div class="max-w-md w-full text-center">
      <!-- 成功 -->
      <template v-if="isSuccess">
        <div class="mb-6">
          <svg class="w-20 h-20 mx-auto text-secondary-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-3xl font-black text-primary-0 mb-3">付款成功！</h1>
        <p class="text-primary-300 mb-2">訂單編號：{{ merchantTradeNo }}</p>
        <p class="text-primary-300 mb-8">點數已加入您的帳戶，歡迎開始預約課程。</p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <router-link
            to="/user/dashboard"
            class="px-6 py-3 bg-secondary-800 text-primary-0 rounded font-medium hover:opacity-90 transition-opacity"
          >
            前往我的課程
          </router-link>
          <router-link
            to="/coaches"
            class="px-6 py-3 border border-primary-300 text-primary-300 rounded font-medium hover:border-primary-0 hover:text-primary-0 transition-colors"
          >
            瀏覽教練
          </router-link>
        </div>
      </template>

      <!-- 失敗 / 取消 -->
      <template v-else>
        <div class="mb-6">
          <svg class="w-20 h-20 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-3xl font-black text-primary-0 mb-3">付款未完成</h1>
        <p class="text-primary-300 mb-8">{{ errorMessage }}</p>
        <router-link
          to="/fitness-plans"
          class="px-6 py-3 bg-secondary-800 text-primary-0 rounded font-medium hover:opacity-90 transition-opacity"
        >
          返回方案頁面
        </router-link>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const isSuccess = computed(() => route.query.RtnCode === "1");
const merchantTradeNo = computed(() => route.query.MerchantTradeNo ?? "");
const errorMessage = computed(() => {
  const msg = route.query.RtnMsg;
  if (!msg) return "付款失敗或已取消，請重新嘗試。";
  return decodeURIComponent(msg);
});
</script>
