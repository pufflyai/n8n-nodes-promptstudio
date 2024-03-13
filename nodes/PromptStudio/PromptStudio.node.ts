// All the node functionality is in this file
// When building more complex nodes, you should consider splitting out your functionality into modules
import { IExecuteFunctions } from 'n8n-core';

import { IDataObject, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { OptionsWithUri } from 'request';

export class PromptStudio implements INodeType {
	description: INodeTypeDescription = {
		// Basic node details will go here
		displayName: 'Prompt Studio',
		name: 'promptStudio',
		icon: 'file:logo.svg',
		group: ['trigger, schedule, transform'],
		version: 1,
		description: 'Run your Prompts',
		defaults: {
			name: 'Prompt Studio',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'promptStudioApi',
				required: true,
			},
		],
		properties: [
			// Resources and operations will go here
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Contact',
						value: 'contact',
					},
				],
				default: 'contact',
				noDataExpression: true,
				required: true,
				description: 'Create a new contact',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['contact'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a contact',
						action: 'Create a contact',
					},
				],
				default: 'create',
				noDataExpression: true,
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['create'],
						resource: ['contact'],
					},
				},
				default: '',
				placeholder: 'name@email.com',
				description: 'Primary email for the contact',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'First Name',
						name: 'firstName',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Last Name',
						name: 'lastName',
						type: 'string',
						default: '',
					},
				],
			},
		],
	};
	// The execute method will go here
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Handle data coming from previous nodes
		const items = this.getInputData();
		let responseData;
		const returnData = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// For each item, make an API call to create a contact
		for (let i = 0; i < items.length; i++) {
			if (resource === 'contact') {
				if (operation === 'create') {
					// Get email input
					const email = this.getNodeParameter('email', i) as string;
					// Get additional fields input
					const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;
					const data: IDataObject = {
						email,
					};

					Object.assign(data, additionalFields);

					// Make HTTP request according to https://sendgrid.com/docs/api-reference/
					const options: OptionsWithUri = {
						headers: {
							Accept: 'application/json',
						},
						method: 'PUT',
						body: {
							contacts: [data],
						},
						uri: `https://api.sendgrid.com/v3/marketing/contacts`,
						json: true,
					};
					responseData = await this.helpers.requestWithAuthentication.call(
						this,
						'promptStudioApi',
						options,
					);
					returnData.push(responseData);
				}
			}
		}
		// Map data to n8n data structure
		return [this.helpers.returnJsonArray(returnData)];
	}
}
