<template>
  <t-dialog v-model:visible="formVisible" :header="$t('pages.setting.dialog.edit')" :width="650" placement="center" :footer="false">
    <template #body>
      <t-form :data="formData" :rules="rules" :label-width="60" @submit="onSubmit">
        <t-form-item :label="$t('pages.setting.drive.name')" name="name">
          <t-input v-model="formData.name" class="input-item" :placeholder="$t('pages.setting.placeholder.general')" />
        </t-form-item>
        <t-form-item :label="$t('pages.setting.drive.server')" name="server">
          <t-input
            v-model="formData.server"
            class="input-item"
            :placeholder="$t('pages.setting.placeholder.general')"
          />
        </t-form-item>
        <t-form-item :label="$t('pages.setting.drive.startPage')" name="startPage">
          <t-input
            v-model="formData.startPage"
            class="input-item"
            :placeholder="$t('pages.setting.placeholder.startPage')"
          />
        </t-form-item>
        <!-- <t-form-item label="搜索" name="search">
          <t-switch v-model="formData.search"/>
        </t-form-item> -->
        <!-- <t-form-item label="请求头" name="headers">
          <t-textarea
            v-model="formData.headers"
            class="input-item input-textarea"
            :placeholder="`{\n\tAuthorization: ''\n}`"
            :autosize="{ minRows: 3, maxRows: 3 }"
          />
        </t-form-item> -->
        <t-form-item :label="$t('pages.setting.drive.params')" name="params">
          <t-textarea
            v-model="formData.params"
            class="input-item input-textarea"
            :placeholder="tip"
            :autosize="{ minRows: 3, maxRows: 3 }"
          />
        </t-form-item>
        <div class="optios">
          <t-form-item style="float: right">
            <t-button variant="outline" @click="onClickCloseBtn">{{ $t('pages.setting.dialog.cancel') }}</t-button>
            <t-button theme="primary" type="submit">{{ $t('pages.setting.dialog.confirm') }}</t-button>
          </t-form-item>
        </div>
      </t-form>
    </template>
  </t-dialog>
</template>

<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next';
import { computed, ref, watch } from 'vue';
import { t } from '@/locales';

import { updateDriveItem } from '@/api/drive';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  data: {
    type: Object,
    default: () => {
      return {};
    },
  },
});
const tip = computed(() => {
  return  `{\n\t"${t('pages.setting.placeholder.paramsPath')}": { "password": "${t('pages.setting.placeholder.paramsPasswd')}" }\n}`
})
const formVisible = ref(false);
const formData = ref(props.data);

const onSubmit = async() => {
  try {
    await updateDriveItem(formData.value.id, formData.value)
    MessagePlugin.success('修改成功');
    formVisible.value = false;
  } catch (err) {
    console.log('Errors: ', err);
    MessagePlugin.error(`修改失败, 错误信息:${err}`);
  }
};
const onClickCloseBtn = () => {
  formVisible.value = false;
};
const emit = defineEmits(['update:visible']);
watch(
  () => formVisible.value,
  (val) => {
    emit('update:visible', val);
  },
);
watch(
  () => props.visible,
  (val) => {
    formVisible.value = val;
  },
);
watch(
  () => props.data,
  (val) => {
    formData.value = val;
  },
);
const rules = {
  name: [{ required: true, message: '请输入内容', type: 'error' }],
  server: [{ required: true, message: '请输入内容', type: 'error' }],
};
</script>
<style lang="less" scoped>
.input-item,
:deep(.t-upload__dragger) {
  width: calc(518px - var(--td-size-1));
}

.upload-item {
  :deep(.t-button--variant-outline) {
    background-color: var(--td-bg-content-input) !important;
    border-color: transparent;
  }
}

.input-item-split {
  width: calc(518px - 130px);
}

.input-textarea {
  width: calc(518px - var(--td-size-2)) !important;
}
</style>
