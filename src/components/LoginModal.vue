<script setup>
import { ref, reactive } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: Boolean,
})
const emit = defineEmits(['close', 'success'])

const userStore = useUserStore()
const form = reactive({ username: '', password: '' })
const loading = ref(false)
const errorMsg = ref('')
const isRegister = ref(false)

async function handleSubmit() {
  errorMsg.value = ''
  if (!form.username.trim()) { errorMsg.value = '请输入用户名'; return }
  if (!form.password.trim()) { errorMsg.value = '请输入密码'; return }
  if (form.password.length < 2) { errorMsg.value = '密码至少需要2个字符'; return }

  loading.value = true
  const result = isRegister.value
    ? await userStore.register(form.username, form.password)
    : await userStore.login(form.username, form.password)
  loading.value = false

  if (result.success) {
    form.username = ''
    form.password = ''
    ElMessage.success(isRegister.value ? '注册成功！' : '登录成功！')
    emit('success')
    emit('close')
  } else {
    errorMsg.value = result.message
  }
}

function handleClose() {
  form.username = ''
  form.password = ''
  errorMsg.value = ''
  isRegister.value = false
  emit('close')
}
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    @close="handleClose"
    :title="isRegister ? '注册' : '登录'"
    width="360px"
    :close-on-click-modal="true"
    align-center
  >
    <el-form @keyup.enter="handleSubmit">
      <el-form-item>
        <el-input v-model="form.username" placeholder="请输入用户名" clearable />
      </el-form-item>
      <el-form-item>
        <el-input v-model="form.password" type="password" placeholder="请输入密码" show-password clearable />
      </el-form-item>
      <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon :closable="false" style="margin-bottom:12px;" />
      <el-button type="primary" style="width:100%;" :loading="loading" @click="handleSubmit">
        {{ isRegister ? '注册' : '登录' }}
      </el-button>
    </el-form>
    <div
      style="text-align:center;margin-top:12px;font-size:0.78rem;color:var(--text-secondary);cursor:pointer;"
      @click="isRegister = !isRegister"
    >
      {{ isRegister ? '已有账号？点击登录' : '没有账号？点击注册' }}
    </div>
  </el-dialog>
</template>
