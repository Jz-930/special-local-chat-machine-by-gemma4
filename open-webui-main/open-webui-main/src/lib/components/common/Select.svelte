<script lang="ts">
	import { flyAndScale } from '$lib/utils/transitions';
	import { tick } from 'svelte';

	/** Currently selected value */
	export let value = '';

	/** Items array: { value: string, label: string }[] */
	export let items = [];

	/** Placeholder text when no value is selected */
	export let placeholder = '';

	/** Callback when value changes */
	export let onChange: (value: string) => void = () => {};

	/** CSS classes for the trigger button */
	export let triggerClass = '';

	/** CSS classes for the label inside the trigger */
	export let labelClass = '';

	/** CSS classes for the dropdown content container */
	export let contentClass =
		'min-w-[170px] rounded-xl border border-gray-200/70 bg-white p-1 text-gray-900 shadow-2xl shadow-black/10 dark:border-gray-700/70 dark:bg-gray-900 dark:text-gray-100 dark:shadow-black/50';

	/** CSS classes for each item button */
	export let itemClass =
		'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition hover:bg-primary-500/10 hover:text-primary-700 dark:hover:bg-primary-500/15 dark:hover:text-primary-200';

	/** Alignment of the dropdown: 'start' | 'end' */
	export let align = 'start';

	/** Callback when dropdown closes */
	export let onClose: () => void = () => {};

	export let open = false;

	let triggerEl;
	let contentEl;

	$: selectedLabel = items.find((i) => i.value === value)?.label ?? placeholder;

	/** Svelte action: moves the node to document.body (portal) */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	function positionContent() {
		if (!triggerEl || !contentEl) return;
		const rect = triggerEl.getBoundingClientRect();

		contentEl.style.position = 'fixed';
		contentEl.style.zIndex = '9999';
		contentEl.style.top = `${rect.bottom + 4}px`;
		contentEl.style.minWidth = `${rect.width}px`;

		if (align === 'end') {
			contentEl.style.right = `${window.innerWidth - rect.right}px`;
			contentEl.style.left = 'auto';
		} else {
			contentEl.style.left = `${rect.left}px`;
			contentEl.style.right = 'auto';
		}
	}

	async function toggleOpen() {
		open = !open;
		if (open) {
			await tick();
			positionContent();
		}
	}

	function handleWindowClick(event) {
		if (!open) return;
		if (triggerEl?.contains(event.target)) return;
		if (contentEl?.contains(event.target)) return;
		open = false;
		onClose();
	}

	function handleKeydown(event) {
		if (event.key === 'Escape' && open) {
			open = false;
			onClose();
		}
	}

	export function selectItem(item) {
		value = item.value;
		open = false;
		onChange(value);
	}
</script>

<svelte:window
	on:click={handleWindowClick}
	on:keydown={handleKeydown}
	on:scroll|capture={positionContent}
	on:resize={positionContent}
/>

<button
	bind:this={triggerEl}
	class={triggerClass}
	aria-label={placeholder}
	type="button"
	on:click={toggleOpen}
>
	<slot name="trigger" {selectedLabel} {open}>
		<span class={labelClass}>
			{selectedLabel}
		</span>
	</slot>
</button>

{#if open}
	<div use:portal bind:this={contentEl} class={contentClass} transition:flyAndScale>
		<slot {open} {selectItem}>
			{#each items as item}
				<button class={itemClass} type="button" on:click={() => selectItem(item)}>
					<slot name="item" {item} selected={value === item.value}>
						{item.label}
					</slot>
				</button>
			{/each}
		</slot>
	</div>
{/if}
