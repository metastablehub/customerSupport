<!-- eslint-disable vue/v-slot-style -->
<script>
import { mapGetters } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useIntegrationHook } from 'dashboard/composables/useIntegrationHook';
import { FormKit } from '@formkit/vue';
import { useBranding } from 'shared/composables/useBranding';

import NextButton from 'dashboard/components-next/button/Button.vue';

export default {
  components: {
    FormKit,
    NextButton,
  },
  props: {
    integrationId: {
      type: String,
      required: true,
    },
    hookToEdit: {
      type: Object,
      default: null,
    },
  },
  emits: ['close'],
  setup(props) {
    const { integration, isHookTypeInbox } = useIntegrationHook(
      props.integrationId
    );
    const { replaceInstallationName } = useBranding();

    return { integration, isHookTypeInbox, replaceInstallationName };
  },
  data() {
    return {
      endPoint: '',
      alertMessage: '',
      values: {},
    };
  },
  computed: {
    isEditMode() {
      return !!this.hookToEdit;
    },
    modalTitle() {
      return this.isEditMode
        ? `Edit ${this.integration.name}`
        : this.integration.name;
    },
    submitLabel() {
      return this.isEditMode
        ? 'Update'
        : this.$t('INTEGRATION_APPS.ADD.FORM.SUBMIT');
    },
    isSubmitting() {
      return this.isEditMode
        ? this.uiFlags.isUpdatingHook
        : this.uiFlags.isCreatingHook;
    },
    ...mapGetters({
      uiFlags: 'integrations/getUIFlags',
      dialogFlowEnabledInboxes: 'inboxes/dialogFlowEnabledInboxes',
    }),
    inboxes() {
      return this.dialogFlowEnabledInboxes
        .filter(inbox => {
          if (!this.isIntegrationDialogflow) {
            return true;
          }
          return !this.connectedDialogflowInboxIds.includes(inbox.id);
        })
        .map(inbox => ({ label: inbox.name, value: inbox.id }));
    },

    connectedDialogflowInboxIds() {
      if (!this.isIntegrationDialogflow) {
        return [];
      }
      return this.integration.hooks.map(hook => hook.inbox?.id);
    },
    formItems() {
      return this.integration.settings_form_schema;
    },
    isIntegrationDialogflow() {
      return this.integration.id === 'dialogflow';
    },
  },
  mounted() {
    if (this.hookToEdit && this.hookToEdit.settings) {
      this.values = { ...this.hookToEdit.settings };
    }
  },
  methods: {
    onClose() {
      this.$emit('close');
    },
    normalizeUrlValue(value) {
      if (
        typeof value === 'string' &&
        value.includes('.') &&
        !/^https?:\/\//i.test(value) &&
        !value.includes(' ')
      ) {
        return `http://${value}`;
      }
      return value;
    },
    buildHookPayload() {
      const hookPayload = {
        app_id: this.integration.id,
        settings: {},
      };

      hookPayload.settings = Object.keys(this.values).reduce((acc, key) => {
        if (key !== 'inbox') {
          acc[key] = this.values[key];
        }
        return acc;
      }, {});

      this.formItems.forEach(item => {
        if (item.validation?.includes('JSON')) {
          hookPayload.settings[item.name] = JSON.parse(
            hookPayload.settings[item.name]
          );
        }
        if (item.validation?.includes('url') || item.name?.includes('url')) {
          hookPayload.settings[item.name] = this.normalizeUrlValue(
            hookPayload.settings[item.name]
          );
        }
      });

      if (this.isHookTypeInbox && this.values.inbox) {
        hookPayload.inbox_id = this.values.inbox;
      }

      return hookPayload;
    },
    async submitForm() {
      try {
        const payload = this.buildHookPayload();
        if (this.isEditMode) {
          payload.hook_id = this.hookToEdit.id;
          await this.$store.dispatch('integrations/updateHook', payload);
          this.alertMessage = 'Integration updated successfully';
        } else {
          await this.$store.dispatch('integrations/createHook', payload);
          this.alertMessage = this.$t(
            'INTEGRATION_APPS.ADD.API.SUCCESS_MESSAGE'
          );
        }
        this.onClose();
      } catch (error) {
        const errorMessage = error?.response?.data?.message;
        this.alertMessage =
          errorMessage || this.$t('INTEGRATION_APPS.ADD.API.ERROR_MESSAGE');
      } finally {
        useAlert(this.alertMessage);
      }
    },
  },
};
</script>

<template>
  <div class="flex flex-col h-auto overflow-auto integration-hooks">
    <woot-modal-header
      :header-title="modalTitle"
      :header-content="replaceInstallationName(integration.short_description)"
    />
    <FormKit
      v-model="values"
      type="form"
      form-class="w-full grid gap-4"
      :submit-attrs="{
        inputClass: 'hidden',
        wrapperClass: 'hidden',
      }"
      :incomplete-message="false"
      @submit="submitForm"
    >
      <FormKit v-for="item in formItems" :key="item.name" v-bind="item" />
      <FormKit
        v-if="isHookTypeInbox"
        :options="inboxes"
        type="select"
        name="inbox"
        input-class="reset-base"
        :placeholder="$t('INTEGRATION_APPS.ADD.FORM.INBOX.LABEL')"
        :label="$t('INTEGRATION_APPS.ADD.FORM.INBOX.PLACEHOLDER')"
        validation="required"
        validation-name="Inbox"
      />
      <div class="flex flex-row justify-end w-full gap-2 px-0 py-2">
        <NextButton
          faded
          slate
          type="reset"
          :label="$t('INTEGRATION_APPS.ADD.FORM.CANCEL')"
          @click.prevent="onClose"
        />
        <NextButton
          type="submit"
          :label="submitLabel"
          :is-loading="isSubmitting"
        />
      </div>
    </FormKit>
  </div>
</template>

<style lang="css">
.formkit-outer {
  @apply mt-2;
}

.formkit-form > .formkit-wrapper > ul.formkit-messages {
  @apply hidden;
}

.formkit-form .formkit-help {
  @apply text-n-slate-10 text-sm font-normal mt-2 w-full;
}

/* equivalent of .reset-base */
.formkit-input {
  margin-bottom: 0px !important;
}

[data-invalid] .formkit-message {
  @apply text-n-ruby-9 block text-xs font-normal my-1 w-full;
}

.formkit-outer[data-type='checkbox'] .formkit-wrapper {
  @apply flex items-center gap-2 px-0.5;
}

.formkit-messages {
  @apply list-none m-0 p-0;
}

.formkit-actions {
  @apply hidden;
}
</style>
