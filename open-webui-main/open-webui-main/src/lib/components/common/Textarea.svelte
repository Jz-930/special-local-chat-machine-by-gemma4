<script lang="ts">
	import { onMount, tick } from 'svelte';

	export let value = '';
	export let placeholder = '';
	export let rows = 1;
	export let minSize = null;
	export let maxSize = null;
	export let required = false;
	export let readonly = false;
	export let className =
		'w-full h-full rounded-lg border border-gray-200/70 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 outline-hidden shadow-inner transition placeholder:text-gray-400 focus:border-primary-500/70 focus:ring-2 focus:ring-primary-500/15 dark:border-gray-700/70 dark:bg-gray-850 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-primary-500/80 dark:focus:ring-primary-500/20';
	export let ariaLabel = null;

	export let onInput = () => {};
	export let onBlur = () => {};

	let textareaElement;

	// Adjust height on mount and after setting the element.
	onMount(async () => {
		await tick();
		resize();

		requestAnimationFrame(() => {
			// setInterveal to cehck until textareaElement is set
			const interval = setInterval(() => {
				if (textareaElement) {
					clearInterval(interval);
					resize();
				}
			}, 100);
		});
	});

	const resize = () => {
		if (textareaElement) {
			textareaElement.style.height = '';

			let height = textareaElement.scrollHeight;
			if (maxSize && height > maxSize) {
				height = maxSize;
			}
			if (minSize && height < minSize) {
				height = minSize;
			}

			textareaElement.style.height = `${height}px`;
		}
	};
</script>

<textarea
	bind:this={textareaElement}
	bind:value
	{placeholder}
	aria-label={ariaLabel || placeholder}
	class={className}
	style="field-sizing: content;"
	{rows}
	{required}
	{readonly}
	on:input={(e) => {
		resize();

		onInput(e);
	}}
	on:focus={() => {
		resize();
	}}
	on:blur={onBlur}
/>
