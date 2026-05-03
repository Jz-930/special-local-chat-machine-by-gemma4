<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	export let state = 'unchecked';
	export let indeterminate = false;
	export let disabled = false;

	export let disabledClassName = 'opacity-50 cursor-not-allowed';

	let _state = 'unchecked';

	$: _state = state;
</script>

<button
	class="inline-block h-4 w-4 rounded-[4px] border text-white shadow-inner outline-hidden transition-all duration-150 {state !==
	'unchecked'
		? 'border-primary-400/80 bg-primary-500 shadow-[0_0_12px_rgba(111,76,255,0.35)]'
		: 'border-gray-300/80 bg-gray-50 hover:border-primary-500/60 hover:bg-primary-500/5 dark:border-gray-700/80 dark:bg-gray-850 dark:hover:border-primary-500/70 dark:hover:bg-primary-500/10'} relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500/70 focus-visible:outline-offset-2 {disabled
		? disabledClassName
		: ''}"
	on:click={() => {
		if (disabled) return;

		if (_state === 'unchecked') {
			_state = 'checked';
			dispatch('change', _state);
		} else if (_state === 'checked') {
			_state = 'unchecked';
			if (!indeterminate) {
				dispatch('change', _state);
			}
		} else if (indeterminate) {
			_state = 'checked';
			dispatch('change', _state);
		}
	}}
	type="button"
	{disabled}
>
	<div class="top-0 left-0 absolute w-full flex justify-center">
		{#if _state === 'checked'}
			<svg
				class="h-4 w-4"
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="3"
					d="m5 12 4.7 4.5 9.3-9"
				/>
			</svg>
		{:else if indeterminate}
			<svg
				class="h-4 w-3.5 text-gray-800 dark:text-white"
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="3"
					d="M5 12h14"
				/>
			</svg>
		{/if}
	</div>

	<!-- {checked} -->
</button>
