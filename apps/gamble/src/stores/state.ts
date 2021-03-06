import { writable } from 'svelte/store';
import { BigNumber, ethers } from 'ethers';
import MetaMaskOnboarding from '@metamask/onboarding';

import { getProviders, lottoProvider } from '../transport';
import { isClientEthInjected } from '../helpers/ssr.helpers';

type State = {
	jackpot: BigNumber;
	userBalance: BigNumber;
	userAddress: string;
	ethereumDetected: boolean;
	errors: null | null;
	bets: BigNumber[][];
	loading: boolean;
	buying: boolean;
};

const initialState: State = {
	jackpot: BigNumber.from(0),
	userBalance: BigNumber.from(0),
	userAddress: '',
	bets: [],
	ethereumDetected: false,
	loading: true,
	errors: null,
	buying: false
};

const createState = () => {
	const { update, subscribe } = writable(initialState);

	const updateJackpot = (jackpot: BigNumber) => update((s) => ({ ...s, jackpot }));

	const updateUserAddress = async (userAddress: string[]) => {
		const { ethereum } = await getProviders();

		// these address simply set a basic cookie on requests that allow requests to
		// render without having to wait on metamask being checked
		// a second check is made 100% at runtime
		if (userAddress.length === 0) {
			fetch('/api/remove-metamask');
			update((s) => ({ ...s, userAddress: '', userBalance: BigNumber.from(0) }));
			return;
		} else {
			fetch('/api/set-metamask', {
				method: 'POST',
				body: JSON.stringify({
					address: userAddress[0]
				})
			});
		}
		const userBalance = await ethereum.getBalance(userAddress[0]);

		update((s) => ({ ...s, userAddress: userAddress[0], userBalance }));
	};

	const updateEthereumDetected = (ethereumDetected: boolean) =>
		update((s) => ({ ...s, ethereumDetected }));

	const updateErrors = (errors: null | null) => update((s) => ({ ...s, errors }));

	const updateBuying = (buying: boolean) => update((s) => ({ ...s, buying }));

	const downloadMetamask = async () => {
		const onboarding = new MetaMaskOnboarding();
		onboarding.startOnboarding();
	};

	const connectMetamask = async () => {
		const { metamask } = await getProviders();
		// @ts-ignore
		metamask.request({ method: 'eth_requestAccounts' });
	};

	const listenJackpot = async () => {
		try {
			const lotto = await lottoProvider();
			const jackpot = await lotto.getCurrentJackpot();
			updateJackpot(jackpot);
			lotto.on('jackpotUpdated', updateJackpot);
		} catch (e) {
			updateErrors(e);
		}
	};

	const initialLoadMetamask = async () => {
		if (isClientEthInjected()) {
			const { ethereum, lotto } = await getProviders();

			// @ts-ignore
			window.ethereum.on('accountsChanged', updateUserAddress);

			try {
				const userAddress = await ethereum.getSigner().getAddress();
				fetch('/api/set-metamask', {
					method: 'POST',
					body: JSON.stringify({
						address: userAddress
					})
				});
				const userBalance = await ethereum.getBalance(userAddress);
				const bets = await lotto.getBets();
				update((state) => ({
					...state,
					userAddress,
					userBalance,
					bets,
					ethereumDetected: true
				}));
			} catch (e) {
				updateErrors(e);
			}
		}
	};

	const placeBet = async (numbers: BigNumber[]) => {
		try {
			const { lotto } = await getProviders();
			await lotto.bet(numbers, {
				value: ethers.utils.parseEther('1')
			});

			update((state) => ({
				...state,
				bets: [...state.bets, numbers],
				buying: false
			}));
		} catch (e) {
			updateErrors(e);
		}
	};

	if (isClientEthInjected()) {
		updateEthereumDetected(true);
		initialLoadMetamask();
	}

	listenJackpot();

	return {
		subscribe,
		placeBet,
		downloadMetamask,
		connectMetamask,
		updateBuying,
		initialLoadMetamask
	};
};

export const stateStore = createState();
