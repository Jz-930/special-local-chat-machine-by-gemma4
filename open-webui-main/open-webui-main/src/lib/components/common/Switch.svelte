<script lang="ts">
	import { Switch } from 'bits-ui';

	import { createEventDispatcher, tick, getContext } from 'svelte';
	import { settings } from '$lib/stores';

	import Tooltip from './Tooltip.svelte';
	export let state = true;
	export let id = '';
	export let ariaLabelledbyId = '';
	export let tooltip = false;

	const i18n = getContext('i18n');
	const dispatch = createEventDispatcher();
</script>

<Tooltip
	content={typeof tooltip === 'string'
		? tooltip
		: typeof tooltip === 'boolean' && tooltip
			? state
				? $i18n.t('Enabled')
				: $i18n.t('Disabled')
			: ''}
	placement="top"
>
	<Switch.Root
		bind:checked={state}
		{id}
		aria-labelledby={ariaLabelledbyId}
		class="flex h-5 min-h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border px-0.5 mx-[1px] shadow-inner transition-all duration-200 ease-out {($settings?.highContrastMode ??
		false)
			? 'focus:outline focus:outline-2 focus:outline-gray-800 focus:dark:outline-gray-200'
			: 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500/70 focus-visible:outline-offset-2'} {state
			? 'border-primary-400/70 bg-primary-500 shadow-[0_0_18px_rgba(111,76,255,0.35)]'
			: 'border-gray-300/70 bg-gray-200 hover:border-primary-500/50 dark:border-gray-700/80 dark:bg-gray-850 dark:hover:border-primary-500/60'}"
		onCheckedChange={async () => {
			await tick();
			dispatch('change', state);
		}}
	>
		<Switch.Thumb
			class="pointer-events-none block size-4 shrink-0 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-1 ring-black/5 transition-transform duration-200 ease-out data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 dark:bg-gray-100"
		/>
	</Switch.Root>
</Tooltip>
